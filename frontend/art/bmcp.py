"""A command-line client for the Blender MCP add-on's socket (127.0.0.1:9876), so a script or an
agent without the MCP tools can drive a running Blender the same way the MCP server does.

python3 art/bmcp.py exec <file.py>         run a Python file inside Blender, print what it printed
python3 art/bmcp.py call <type> [json]     any add-on command, e.g. call get_scene_info
python3 art/bmcp.py shot <out.png> [px]    save a viewport screenshot
"""

import json
import socket
import sys


def call(kind, params=None, timeout=900):
    s = socket.create_connection(('127.0.0.1', 9876), timeout=timeout)
    s.sendall(json.dumps({'type': kind, 'params': params or {}}).encode())
    buf = b''
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
        try:
            out = json.loads(buf.decode())
            break
        except ValueError:
            continue
    s.close()
    return out


def main():
    cmd = sys.argv[1]
    if cmd == 'exec':
        with open(sys.argv[2]) as f:
            res = call('execute_code', {'code': f.read()})
        if res.get('status') != 'success':
            print(json.dumps(res, indent=2))
            sys.exit(1)
        print(res['result'].get('result', res['result']) if isinstance(res['result'], dict) else res['result'])
    elif cmd == 'shot':
        params = {'filepath': sys.argv[2]}
        if len(sys.argv) > 3:
            params['max_size'] = int(sys.argv[3])
        print(json.dumps(call('get_viewport_screenshot', params)))
    elif cmd == 'call':
        params = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        print(json.dumps(call(sys.argv[2], params), indent=2))
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
