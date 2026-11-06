"""Local website preview. Private sources and dotfiles are never served."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        path = Path(self.translate_path(self.path)).resolve()
        try:
            parts = path.relative_to(ROOT).parts
        except ValueError:
            self.send_error(404)
            return None
        if any(p.startswith('.') for p in parts) or (parts and parts[0] in {'private', 'node_modules', 'docs', 'sampledata'}):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    print('Website preview: http://localhost:8015/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8015), Preview).serve_forever()
