"""Import real FlyWire-783 precomputed skeletons matching the simulator's IDs.

TLS verification remains enabled. Source data licenses must be verified before redistribution. By default the
license is read from the documented Zenodo record; explicit --license and
--license-url are available for a separately verified source record.
No credentials are needed for the documented public per-neuron endpoint.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct
import urllib.request

SOURCE = 'https://flyem.mrc-lmb.cam.ac.uk/flyconnectome/flywire_skeletons_783'
ROOT = Path(__file__).resolve().parents[1]
RECORD = 'https://zenodo.org/api/records/10877326'


def source_license():
    with urllib.request.urlopen(RECORD, timeout=30) as response:
        raw = response.read(2*1024*1024+1)
    if len(raw) > 2*1024*1024:
        raise ValueError('Source metadata exceeds the size limit')
    record = json.loads(raw)
    license_id = record.get('metadata', {}).get('license', {}).get('id')
    if not license_id:
        raise ValueError('The source record does not identify a license; verify its terms before redistribution')
    return license_id, 'https://zenodo.org/records/10877326', hashlib.sha256(raw).hexdigest()


def decode_skeleton(raw):
    """Neuroglancer precomputed skeleton: uint32 counts, xyz float32, edge uint32.

    Additional radius attributes are not needed for a line skeleton. Coordinates
    are source nanometers, converted here to micrometers with no atlas transform.
    """
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    if len(raw) < 8:
        raise ValueError('Truncated skeleton header')
    n, m = struct.unpack_from('<II', raw)
    if n == 0 or n > 10_000_000 or m > 20_000_000:
        raise ValueError('Invalid skeleton counts')
    expected = 8 + n * 12 + m * 8
    if len(raw) < expected:
        raise ValueError('Truncated skeleton geometry')
    xyz = list(struct.iter_unpack('<fff', raw[8:8+n*12]))
    if any(not math.isfinite(v) for point in xyz for v in point):
        raise ValueError('Non-finite anatomical coordinate')
    edges = list(struct.iter_unpack('<II', raw[8+n*12:expected]))
    if any(a >= n or b >= n or a == b for a, b in edges):
        raise ValueError('Invalid skeleton edge')
    return [[v / 1000 for v in p] for p in xyz], edges


def decode_swc_rows(rows):
    """Map SWC node IDs to local indices; input coordinates are nanometers."""
    ids = [row['node_id'] for row in rows]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate SWC node IDs')
    index = {node_id: i for i, node_id in enumerate(ids)}
    vertices, edges = [], []
    for i, row in enumerate(rows):
        point = [float(row[axis]) / 1000 for axis in ('x', 'y', 'z')]
        if not all(math.isfinite(v) for v in point):
            raise ValueError('Non-finite anatomical coordinate')
        vertices.append(point)
        parent = row['parent_id']
        if parent is None or parent < 0:
            continue
        if parent not in index:
            raise ValueError(f'SWC parent {parent} is missing from its neuron')
        if index[parent] == i:
            raise ValueError('SWC self-parent edge')
        edges.append((index[parent], i))
    return vertices, edges


def read_parquet_rows(path, wanted):
    try:
        import pyarrow.parquet as pq
    except ImportError as error:
        raise RuntimeError('Parquet imports require pyarrow: python -m pip install pyarrow') from error
    file = pq.ParquetFile(path, memory_map=True, pre_buffer=False)
    column = next((name for name in ('neuron', 'fragment_id') if name in file.schema_arrow.names), None)
    if column is None:
        raise ValueError('Parquet file has no neuron ID column')
    columns = [column, 'node_id', 'parent_id', 'x', 'y', 'z']
    if not set(columns).issubset(file.schema_arrow.names):
        raise ValueError('Parquet must contain SWC node_id, parent_id and x/y/z columns')
    grouped = {root_id: [] for root_id in wanted}
    for batch in file.iter_batches(batch_size=8192, columns=columns, use_threads=False):
        data = batch.to_pydict()
        for i, value in enumerate(data[column]):
            root_id = str(value)
            if root_id in grouped:
                grouped[root_id].append({name: data[name][i] for name in columns if name != column})
    return grouped


def simplify_skeleton(vertices, edges, tolerance=0.25):
    """Decimate only degree-two paths; retain every branch point and terminal.

    Douglas–Peucker tolerance is in micrometers; branches are never invented.
    Isolated vertices are preserved. Cycles are retained rather than simplified.
    """
    if tolerance < 0:
        raise ValueError('Tolerance must be non-negative')
    adjacency = [[] for _ in vertices]
    for a, b in edges:
        adjacency[a].append(b); adjacency[b].append(a)
    visited, output = set(), []

    def simplify(path):
        keep = {0, len(path)-1}; stack = [(0, len(path)-1)]
        while stack:
            start, stop = stack.pop()
            if stop - start < 2:
                continue
            a, b = vertices[path[start]], vertices[path[stop]]
            direction = [y-x for x, y in zip(a, b)]
            norm = sum(x*x for x in direction)
            farthest, best = None, tolerance*tolerance
            for i in range(start+1, stop):
                p = vertices[path[i]]
                t = max(0, min(1, sum((p[j]-a[j])*direction[j] for j in range(3))/norm)) if norm else 0
                distance = sum((p[j]-a[j]-t*direction[j])**2 for j in range(3))
                if distance > best:
                    farthest, best = i, distance
            if farthest is not None:
                keep.add(farthest); stack.extend([(start, farthest), (farthest, stop)])
        ids = [path[i] for i in sorted(keep)]
        return list(zip(ids, ids[1:]))

    for start, neighbors in enumerate(adjacency):
        if len(neighbors) == 2:
            continue
        for nxt in neighbors:
            key = tuple(sorted((start, nxt)))
            if key in visited:
                continue
            path = [start, nxt]; visited.add(key)
            while len(adjacency[path[-1]]) == 2:
                current = path[-1]
                following = next(x for x in adjacency[current] if x != path[-2])
                key = tuple(sorted((current, following)))
                if key in visited:
                    break
                visited.add(key); path.append(following)
            output.extend(simplify(path))
    # Remaining edges belong to cycles; preserve those coordinates exactly.
    output.extend((a, b) for a, b in edges if tuple(sorted((a, b))) not in visited)
    retained = sorted({v for edge in output for v in edge} | {i for i, n in enumerate(adjacency) if not n})
    remap = {old: new for new, old in enumerate(retained)}
    return [[round(v, 4) for v in vertices[i]] for i in retained], [[remap[a], remap[b]] for a, b in output]


def overview_skeleton(vertices, edges, minimum_terminal_length=5.0, tolerance=0.75):
    """Display-only LOD: omit short terminal twigs, then simplify core paths."""
    adjacency = [[] for _ in vertices]
    for a, b in edges:
        adjacency[a].append(b); adjacency[b].append(a)
    remove = set()
    for leaf, neighbors in enumerate(adjacency):
        if len(neighbors) != 1:
            continue
        path = [leaf, neighbors[0]]
        length = math.dist(vertices[path[0]], vertices[path[1]])
        while len(adjacency[path[-1]]) == 2:
            current = path[-1]
            following = next(i for i in adjacency[current] if i != path[-2])
            length += math.dist(vertices[current], vertices[following])
            path.append(following)
        if len(adjacency[path[-1]]) >= 3 and length < minimum_terminal_length:
            remove.update(path[:-1])
    remaining = [(a,b) for a,b in edges if a not in remove and b not in remove]
    if not remaining:
        return simplify_skeleton(vertices, edges, tolerance)
    keep = sorted({i for edge in remaining for i in edge})
    indices = {old:new for new,old in enumerate(keep)}
    return simplify_skeleton([vertices[i] for i in keep], [(indices[a],indices[b]) for a,b in remaining], tolerance)


def write_bundle(path, skeletons):
    """Compact little-endian geometry, preserving IDs in the manifest as strings."""
    temporary = path.with_suffix(path.suffix + '.tmp')
    entries = []
    with temporary.open('wb') as output:
        output.write(b'CTSK0001')
        for item in skeletons:
            offset = output.tell()
            output.write(struct.pack('<II', len(item['vertices']), len(item['edges'])))
            for point in item['vertices']:
                output.write(struct.pack('<fff', *point))
            for edge in item['edges']:
                output.write(struct.pack('<II', *edge))
            entries.append({'id': item['id'], 'offset': offset, 'bytes': output.tell()-offset,
                'vertices':len(item['vertices']), 'edges':len(item['edges']), 'source_sha256':item['source_sha256']})
    temporary.replace(path)
    return entries, hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit', type=int, default=24, help='Prototype neuron count; 0 imports the full circuit')
    parser.add_argument('--tolerance', type=float, default=0.25, help='Path simplification error, micrometers')
    parser.add_argument('--cache', type=Path, default=ROOT.parent.parent/'connectometwin-setup'/'anatomy-cache')
    parser.add_argument('--output', type=Path, default=ROOT/'web'/'data'/'anatomy')
    parser.add_argument('--overview', action='store_true', help='Also generate a fast display-only LOD; retain the full bundle')
    parser.add_argument('--bundle', action='store_true', help='Write a compact single-request browser bundle instead of individual JSON files')
    parser.add_argument('--parquet', type=Path, help='Read a local FlyWire-783 SWC Parquet subset instead of downloading')
    parser.add_argument('--input-dir', type=Path, help='Read locally supplied <root-id> binary files instead of downloading')
    parser.add_argument('--license', help='Verified license identifier from the source record')
    parser.add_argument('--license-url', help='Authoritative license/source record URL')
    parser.add_argument('--allow-partial', action='store_true', help='Export successful IDs and explicitly list missing IDs')
    args = parser.parse_args()
    if args.overview and not args.bundle:
        parser.error('--overview requires --bundle')
    if args.parquet and args.input_dir:
        parser.error('Use either --parquet or --input-dir')
    if args.limit < 0 or args.tolerance < 0:
        parser.error('limit and tolerance must be non-negative')
    if bool(args.license) != bool(args.license_url):
        parser.error('Provide both --license and --license-url, or neither to verify the Zenodo record')
    license_record_sha256 = None
    if not args.license:
        try:
            args.license, args.license_url, license_record_sha256 = source_license()
        except Exception as error:
            raise SystemExit(f'Cannot verify source license: {error}. No anatomy was imported.') from error
    if not args.license_url.startswith('https://'):
        parser.error('license-url must be an authoritative HTTPS URL')
    data = json.loads((ROOT/'web'/'data'/'fafb.json').read_text())
    # The prototype prioritizes EPG neurons to show real modeled heading activity.
    neurons = sorted(data['neurons'], key=lambda n: (not n['family'].startswith('EPG'), n['id']))
    if args.limit:
        neurons = neurons[:args.limit]
    args.cache.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)

    parquet_rows = read_parquet_rows(args.parquet, {n['id'] for n in neurons}) if args.parquet else None
    parquet_sha256 = hashlib.sha256(args.parquet.read_bytes()).hexdigest() if args.parquet else None

    def fetch(neuron):
        root_id = neuron['id']; cache = args.cache/root_id
        try:
            if args.parquet:
                if not parquet_rows[root_id]:
                    raise ValueError('Neuron is absent from Parquet subset')
                vertices, edges = decode_swc_rows(parquet_rows[root_id])
                raw = None
            elif args.input_dir:
                raw = (args.input_dir/root_id).read_bytes()
            elif cache.exists():
                raw = cache.read_bytes()
            else:
                request = urllib.request.Request(f'{SOURCE}/{root_id}', headers={'Accept-Encoding':'identity'})
                with urllib.request.urlopen(request, timeout=45) as response:
                    raw = response.read(128*1024*1024+1)
                if len(raw) > 128*1024*1024:
                    raise ValueError('Skeleton exceeds the per-neuron size limit')
                # Validate before retaining any cached artifact.
                decode_skeleton(raw)
                cache.write_bytes(raw)
            if raw is not None:
                vertices, edges = decode_skeleton(raw)
            original_count = len(vertices)
            vertices, edges = simplify_skeleton(vertices, edges, args.tolerance)
            return {'id':root_id, 'vertices':vertices, 'edges':edges, 'original_vertices':original_count,
                    'source_sha256':parquet_sha256 if args.parquet else hashlib.sha256(raw).hexdigest()}, None
        except Exception as error:
            return None, {'id':root_id,'error':str(error)}

    # Test one known circuit ID before scheduling the rest: a denied endpoint
    # must not trigger hundreds of identical failed requests.
    first = fetch(neurons[0])
    if first[1] and not args.allow_partial:
        raise SystemExit(f'First skeleton could not be loaded: {first[1]["error"]}. Existing anatomy was left unchanged.')
    with ThreadPoolExecutor(max_workers=4) as pool:
        outcomes = [first] + list(pool.map(fetch, neurons[1:]))
    successful = [value for value, error in outcomes if value]
    missing = [error for value, error in outcomes if error]
    if missing and not args.allow_partial:
        print(json.dumps({'downloaded':len(successful),'missing':missing}, indent=2))
        raise SystemExit('Incomplete download; existing published anatomy was left unchanged. Resolve access or use --allow-partial.')
    if not successful:
        raise SystemExit('No matching anatomy was imported; existing manifest was left unchanged.')
    bundle = None
    if args.bundle:
        entries, checksum = write_bundle(args.output/'flywire-783.ctsk', successful)
        bundle = {'file':'flywire-783.ctsk','format':'ct-skeletons-v1','bytes':(args.output/'flywire-783.ctsk').stat().st_size,'sha256':checksum}
    else:
        for value in successful:
            atomic_json(args.output/(value['id']+'.json'),value)
        entries = [{'id':x['id'],'file':x['id']+'.json','vertices':len(x['vertices']),'edges':len(x['edges']),'source_sha256':x['source_sha256']} for x in successful]
    manifest = {'schema':1,'status':'ready' if len(successful)==len(data['neurons']) else 'partial',
        'dataset':'FlyWire materialization 783','coordinate_units':'micrometers',
        'source':('https://zenodo.org/records/10877326/files/sk_lod1_783_healed_ds2.parquet' if args.parquet else SOURCE),'source_record':'https://zenodo.org/records/10877326',
        'license':args.license,'license_url':args.license_url,'license_record_sha256':license_record_sha256,'simplification_tolerance_um':args.tolerance,
        'source_subset_sha256':parquet_sha256,
        'attribution':'Schlegel, P., & Jefferis, G. S. X. E. (2024). Supplemental Files for Schlegel et al., Nature (2024). Zenodo. DOI: 10.5281/zenodo.10877326',
        'source_coordinate_units':'nanometers','source_vertices':sum(x['original_vertices'] for x in successful),
        'display_vertices':sum(len(x['vertices']) for x in successful),'display_edges':sum(len(x['edges']) for x in successful),
        'circuit_neurons':len(data['neurons']),'requested_neurons':len(neurons),'missing':missing,
        'bundle':bundle,'neurons':entries}
    if args.overview:
        overview = []
        for item in successful:
            points, edges = overview_skeleton(item['vertices'],item['edges'])
            overview.append({**item,'vertices':points,'edges':edges})
        overview_entries, overview_checksum = write_bundle(args.output/'flywire-783-overview.ctsk',overview)
        manifest['levels'] = {'overview':{'bundle':{'file':'flywire-783-overview.ctsk','format':'ct-skeletons-v1','bytes':(args.output/'flywire-783-overview.ctsk').stat().st_size,'sha256':overview_checksum},'neurons':overview_entries,'minimum_terminal_length_um':5.0,'path_tolerance_um':0.75,'display_edges':sum(len(item['edges']) for item in overview),'note':'Display-only overview omits short terminal twigs; the full bundle retains all simplified branches.'}}
    atomic_json(args.output/'manifest.json',manifest)
    print(f'Imported {len(successful)}/{len(data["neurons"])} matching FlyWire neurons; {len(missing)} requests failed.')


if __name__ == '__main__':
    main()
