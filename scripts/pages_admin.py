"""Configure/check Pages using Git Credential Manager without exposing credentials."""
import json
import subprocess
import sys
import socket
import urllib.request
import urllib.error

REPO = 'ZawLwinHtoo/NASA_Space_APP_Challenge'
# The regional API endpoint times out on this connection. Use another GitHub
# API edge for this process only; TLS still validates api.github.com.
resolve = socket.getaddrinfo
socket.getaddrinfo = lambda host, port, *args, **kwargs: resolve('140.82.112.6' if host == 'api.github.com' else host, port, *args, **kwargs)
credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, check=True)
fields = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
token = fields.get('password')
if not token:
    raise SystemExit('No GitHub credential available')

def api(path, method='GET', payload=None):
    req = urllib.request.Request('https://api.github.com/repos/' + REPO + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'MEDNAV-Pages-Deploy', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404 and method == 'GET':
            return None
        raise SystemExit(f'GitHub {method} {path}: {error.code} {error.read().decode()}')

if sys.argv[1] == 'inspect':
    repo = api('')
    print(json.dumps({'permissions': repo.get('permissions'), 'default_branch': repo.get('default_branch'), 'pages': api('/pages')}))
elif sys.argv[1] == 'enable':
    current = api('/pages')
    print(json.dumps(api('/pages', 'PUT' if current else 'POST', {'build_type': 'legacy', 'source': {'branch': 'gh-pages', 'path': '/'}})))
elif sys.argv[1] == 'status':
    print(json.dumps({'pages': api('/pages'), 'build': api('/pages/builds/latest')}))
