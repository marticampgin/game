"""Publish a complete bitmap while the running game serves the previous edition."""
from pathlib import Path
from tempfile import NamedTemporaryFile


def publish(image, destination, **options):
    if not options:
        options = {'optimize': True} if destination.suffix == '.png' else {'lossless': True, 'method': 5}
    with NamedTemporaryFile(dir=destination.parent, suffix=destination.suffix, delete=False) as temp:
        staged = Path(temp.name)
    try:
        image.save(staged, **options)
        staged.replace(destination)
    finally:
        staged.unlink(missing_ok=True)
