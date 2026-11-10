"""Regression tests for ALICE FBX-derived GLB -> VRM conversion."""
import hashlib
import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('alice_converter', ROOT / 'tools/alice_glb_to_vrm.py')
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)

def fixture():
    names = dict(converter.REQUIRED)
    nodes = [{'name': name} for name in names.values()]
    index = {semantic: i for i, semantic in enumerate(names)}
    pairs = [('spine','hips'),('head','spine'),
             ('leftLowerArm','leftUpperArm'),('leftHand','leftLowerArm'),
             ('rightLowerArm','rightUpperArm'),('rightHand','rightLowerArm'),
             ('leftLowerLeg','leftUpperLeg'),('leftFoot','leftLowerLeg'),
             ('rightLowerLeg','rightUpperLeg'),('rightFoot','rightLowerLeg')]
    for child, parent in pairs:
        nodes[index[parent]].setdefault('children', []).append(index[child])
    nodes.append({'name':'FaceMesh','mesh':0,'skin':0})
    targets = ['eyeBlinkLeft','eyeBlinkRight','aa','ih','ou','E','oh']
    doc = {'asset':{'version':'2.0'},'nodes':nodes,
           'skins':[{'joints':list(range(len(names)))}],
           'meshes':[{'extras':{'targetNames':targets},
                      'primitives':[{'targets':[{} for _ in targets]}]}]}
    return converter.write_glb(doc, [(b'JSON',b''),(b'BIN\x00',b'\x00\x00\x00\x00')])

class ConverterRegression(unittest.TestCase):
    def test_roundtrip(self):
        raw = fixture()
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)/'source.glb'
            output = Path(tmp)/'out.vrm'
            report = Path(tmp)/'audit'/'report.json'
            source.write_bytes(raw)
            converter.convert(source, output, report, hashlib.sha256(raw).hexdigest())
            old, old_chunks = converter.read_glb(raw)
            new, new_chunks = converter.read_glb(output.read_bytes())
            self.assertEqual(old_chunks[1:], new_chunks[1:])
            self.assertEqual(len(new['extensions']['VRMC_vrm']['humanoid']['humanBones']),len(converter.REQUIRED))
            audit = json.loads(report.read_text())
            self.assertEqual(audit['riggedMeshNodeCount'],1)
            self.assertTrue(audit['humanoidJointCoverageVerified'])
            self.assertFalse(audit['approvedCanonical'])
    def test_rejects_bones_not_in_skin(self):
        document,chunks = converter.read_glb(fixture())
        document['skins'][0]['joints'].remove(0)
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)/'source.glb'
            source.write_bytes(converter.write_glb(document,chunks))
            with self.assertRaisesRegex(ValueError,'single GLB skin'):
                converter.convert(source,Path(tmp)/'out.vrm',Path(tmp)/'report.json',None)
    def test_report_output_collision(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp)/'source.glb',Path(tmp)/'out.vrm'
            source.write_bytes(fixture())
            with self.assertRaisesRegex(ValueError,'Report must not overwrite'):
                converter.convert(source,output,output,None)
    def test_truncated_chunk_header(self):
        raw=fixture()+b'abc'
        raw=raw[:8]+struct.pack('<I',len(raw))+raw[12:]
        with self.assertRaisesRegex(ValueError,'Truncated GLB chunk header'):
            converter.read_glb(raw)

if __name__=='__main__':
    unittest.main()
