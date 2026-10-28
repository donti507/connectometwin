"""Importer tests use synthetic geometry in temporary files, never product anatomy."""
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
from unittest.mock import patch
import gzip
import math
from pathlib import Path
import struct
import unittest

spec = importlib.util.spec_from_file_location('import_anatomy', Path(__file__).parents[1]/'scripts'/'import_anatomy.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def binary(vertices, edges):
    return struct.pack('<II', len(vertices), len(edges)) + b''.join(struct.pack('<fff', *p) for p in vertices) + b''.join(struct.pack('<II', *e) for e in edges)


class AnatomyTests(unittest.TestCase):
    def test_decode_units_edges_and_gzip(self):
        raw = binary([(1000, 2000, 3000), (2000, 3000, 4000)], [(0, 1)])
        vertices, edges = module.decode_skeleton(raw)
        self.assertEqual(vertices, [[1, 2, 3], [2, 3, 4]])
        self.assertEqual(edges, [(0, 1)])
        self.assertEqual(module.decode_skeleton(gzip.compress(raw)), (vertices, edges))

    def test_license_is_read_from_source_record_without_guessing(self):
        with patch.object(module.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"metadata":{"license":{"id":"test-license"}}}')):
            license_id, url, checksum = module.source_license()
        self.assertEqual(license_id, 'test-license')
        self.assertEqual(url, 'https://zenodo.org/records/10877326')
        self.assertEqual(len(checksum), 64)
        with patch.object(module.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"metadata":{}}')):
            with self.assertRaises(ValueError):
                module.source_license()

    def test_local_cli_writes_only_a_temporary_partial_dataset(self):
        model = json.loads((module.ROOT/'web'/'data'/'fafb.json').read_text())
        neuron = sorted(model['neurons'], key=lambda n: (not n['family'].startswith('EPG'), n['id']))[0]
        canonical = (module.ROOT/'web'/'data'/'anatomy'/'manifest.json').read_bytes()
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder/neuron['id']).write_bytes(binary([(0, 0, 0), (1000, 1000, 0)], [(0, 1)]))
            result = subprocess.run([sys.executable, str(module.ROOT/'scripts'/'import_anatomy.py'), '--limit', '1',
                '--input-dir', str(folder), '--output', str(folder/'out'), '--cache', str(folder/'cache'),
                '--license', 'SYNTHETIC TEST ONLY', '--license-url', 'https://example.invalid/test'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            manifest = json.loads((folder/'out'/'manifest.json').read_text())
            self.assertEqual(manifest['status'], 'partial')
            self.assertEqual(manifest['neurons'][0]['id'], neuron['id'])
            geometry = json.loads((folder/'out'/(neuron['id']+'.json')).read_text())
            self.assertEqual(geometry['vertices'], [[0, 0, 0], [1, 1, 0]])
        self.assertEqual((module.ROOT/'web'/'data'/'anatomy'/'manifest.json').read_bytes(), canonical)

    def test_bad_counts_coordinates_and_edges(self):
        for raw in [b'bad', struct.pack('<II', 10, 20), binary([(math.nan, 0, 0)], []), binary([(0, 0, 0)], [(0, 1)])]:
            with self.assertRaises(ValueError):
                module.decode_skeleton(raw)

    def test_simplification_preserves_branch_and_terminal_coordinates(self):
        vertices = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 1, 0], [3, -1, 0], [9, 9, 9]]
        edges = [(0, 1), (1, 2), (2, 3), (2, 4)]
        points, links = module.simplify_skeleton(vertices, edges, .25)
        self.assertEqual(points, [vertices[i] for i in [0, 2, 3, 4, 5]])
        self.assertEqual(len(links), 3)
        self.assertNotIn(vertices[1], points)

    def test_simplification_retains_curvature_and_cycles(self):
        vertices = [[0, 0, 0], [1, 1, 0], [2, 0, 0]]
        self.assertEqual(module.simplify_skeleton(vertices, [(0, 1), (1, 2)], .1)[0], vertices)
        self.assertEqual(module.simplify_skeleton(vertices, [(0, 1), (1, 2), (2, 0)], 10)[0], vertices)
        with self.assertRaises(ValueError):
            module.simplify_skeleton(vertices, [], -1)


if __name__ == '__main__':
    unittest.main()
