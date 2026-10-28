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
    parser.add_argument('--input-dir', type=Path, help='Read locally supplied <root-id> binary files instead of downloading')
    parser.add_argument('--license', help='Verified license identifier from the source record')
    parser.add_argument('--license-url', help='Authoritative license/source record URL')
    parser.add_argument('--allow-partial', action='store_true', help='Export successful IDs and explicitly list missing IDs')
    args = parser.parse_args()
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

    def fetch(neuron):
        root_id = neuron['id']; cache = args.cache/root_id
        try:
            if args.input_dir:
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
            vertices, edges = decode_skeleton(raw)
            original_count = len(vertices)
            vertices, edges = simplify_skeleton(vertices, edges, args.tolerance)
            return {'id':root_id, 'vertices':vertices, 'edges':edges, 'original_vertices':original_count,
                    'source_sha256':hashlib.sha256(raw).hexdigest()}, None
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
    for value in successful:
        atomic_json(args.output/(value['id']+'.json'),value)
    manifest = {'schema':1,'status':'ready' if len(successful)==len(data['neurons']) else 'partial',
        'dataset':'FlyWire materialization 783','coordinate_units':'micrometers',
        'source':SOURCE,'source_record':'https://zenodo.org/records/10877326',
        'license':args.license,'license_url':args.license_url,'license_record_sha256':license_record_sha256,'simplification_tolerance_um':args.tolerance,
        'circuit_neurons':len(data['neurons']),'requested_neurons':len(neurons),'missing':missing,
        'neurons':[{'id':x['id'],'file':x['id']+'.json','vertices':len(x['vertices']),'edges':len(x['edges']),
                    'source_sha256':x['source_sha256']} for x in successful]}
    atomic_json(args.output/'manifest.json',manifest)
    print(f'Imported {len(successful)}/{len(data["neurons"])} matching FlyWire neurons; {len(missing)} requests failed.')


if __name__ == '__main__':
    main()
