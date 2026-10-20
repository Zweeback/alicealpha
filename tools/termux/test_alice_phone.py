"""Offline standard-library tests for the Termux phone CLI."""
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("alice_phone", Path(__file__).with_name("alice_phone.py"))
phone = importlib.util.module_from_spec(spec)
spec.loader.exec_module(phone)


class BridgeTests(unittest.TestCase):
    def test_pair_endpoint_strict(self):
        self.assertEqual(phone.validate_endpoint("127.0.0.1:37145"), "127.0.0.1:37145")
        for invalid in ["localhost", "127.0.0.1:0", "10.0.0.1:99999", "bad host:42",
                        "--help", "127.0.0.1:1111;echo BAD"]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                phone.validate_endpoint(invalid)

    def test_devices_parses_state_without_claiming_authorization(self):
        text = "List of devices attached\n192.168.1.2:34343 device product:pixel\nother offline\n"
        with patch.object(phone, "optional", return_value=text):
            self.assertEqual(phone.device_list()["devices"], [
                {"serial": "192.168.1.2:34343", "state": "device"},
                {"serial": "other", "state": "offline"}])

    def test_single_device_is_required(self):
        with patch.object(phone, "device_list", return_value={"available": True, "devices": []}):
            with self.assertRaises(RuntimeError):
                phone.selected_device()
        with patch.object(phone, "device_list", return_value={"available": True, "devices": [
            {"serial": "a", "state": "device"}, {"serial": "b", "state": "device"}]}):
            with self.assertRaises(RuntimeError):
                phone.selected_device()

    def test_no_command_injection_and_boundaries(self):
        with patch.object(phone, "selected_device", return_value="device123"), patch.object(phone, "execute") as execute:
            args = phone.build_parser().parse_args(["tap", "123", "456"])
            self.assertTrue(phone.handle(args)["ok"])
            execute.assert_called_once_with(["adb", "-s", "device123", "shell", "input", "tap", "123", "456"])
        with self.assertRaises(ValueError):
            phone.integer("12; rm -rf /", 0, 10000)
        with self.assertRaises(ValueError):
            phone.integer("10001", 0, 10000)

    def test_status_distinguishes_availability(self):
        with patch.object(phone, "optional", return_value=None), patch.object(
            phone, "device_list", return_value={"available": False, "devices": []}):
            result = phone.status()
        self.assertEqual(result["schema"], "alice-termux-status/1")
        self.assertFalse(result["remote_chatgpt_connected"])
        self.assertIsNone(result["battery"])
        self.assertFalse(result["adb"]["available"])

    def test_adb_timeout_is_not_silent_success(self):
        with patch.object(phone.shutil, "which", return_value="/bin/adb"), patch.object(
            phone.subprocess, "run", side_effect=subprocess.TimeoutExpired(cmd="adb", timeout=1)):
            with self.assertRaisesRegex(RuntimeError, "Timed out"):
                phone.execute(["adb", "devices"], timeout=1)


if __name__ == "__main__":
    unittest.main()
