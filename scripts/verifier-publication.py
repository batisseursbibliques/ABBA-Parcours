#!/usr/bin/env python3
"""Garde-fou de publication : vérifie que chaque fichier utilisé par l'app a bien été copié sur le site.
Usage : verifier-publication.py <dossier source> <dossier publié>
Échoue (code 1) avec un message clair si un fichier appelé par une page HTML, un import JavaScript
ou la liste du service worker (sw.js) n'est pas présent dans le dossier publié.
Cause typique : un nouveau fichier créé mais oublié dans la liste « cp » de publier-domaine.yml."""
import glob, os, re, sys

src, pub = sys.argv[1], sys.argv[2]
refs = []
for f in glob.glob(os.path.join(src, '*.html')):
    t = open(f, encoding='utf-8').read()
    for m in re.finditer(r'(?:src|href)="([^"#?:]+\.(?:js|css|png|jpg|webp|json|html))"', t):
        refs.append((os.path.basename(f), m.group(1)))
for f in glob.glob(os.path.join(src, '*.js')):
    t = open(f, encoding='utf-8').read()
    for m in re.finditer(r'''(?:from\s+|import\s*\(\s*|import\s+)["'](\./[^"']+\.js)["']''', t):
        refs.append((os.path.basename(f), m.group(1)))
sw = os.path.join(src, 'sw.js')
if os.path.exists(sw):
    for m in re.finditer(r'"\./([^"]+\.[a-z0-9]+)"', open(sw, encoding='utf-8').read()):
        refs.append(('sw.js', m.group(1)))

manque = set()
for qui, r in refs:
    if r.startswith('/') or r.startswith('http'):
        continue  # fichiers d'autres dossiers du site, ou adresses externes
    p = r[2:] if r.startswith('./') else r
    if os.path.exists(os.path.join(src, p)) and not os.path.exists(os.path.join(pub, p)):
        manque.add((p, qui))
if manque:
    for p, qui in sorted(manque):
        print(f"::error title=Fichier non publié::{p} est utilisé par {qui} mais n'a pas été copié. Ajoutez-le à la liste « cp » de .github/workflows/publier-domaine.yml.")
    sys.exit(1)
print(f"Publication vérifiée : {len(refs)} références, aucun fichier manquant.")
