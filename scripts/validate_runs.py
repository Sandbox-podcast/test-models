"""Record or verify benchmark submissions without running their demos."""

import argparse
from datetime import date
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
BUILT_IN = {"GTA-like", "Transformer", "landing"}


def read_file(path):
    file = ROOT / path
    if file.resolve() != file or not file.is_file():
        raise ValueError(f"{path} doit être un fichier ordinaire du dépôt")
    return file.read_bytes()


def read_object(path):
    value = json.loads(read_file(path).decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} doit contenir un objet JSON")
    return value


def nonempty_string(value):
    return isinstance(value, str) and bool(value.strip())


def load_protocol(benchmark, files):
    path = f"{benchmark}/protocol.json"
    protocol = read_object(path)
    for key in ("inputs", "steps", "criteria"):
        items = protocol.get(key)
        if not isinstance(items, list) or not items or not all(map(nonempty_string, items)):
            raise ValueError(f"{path} doit renseigner la liste {key}")
    if "effort" in protocol and not nonempty_string(protocol["effort"]):
        raise ValueError(f"{path} doit définir effort comme du texte")

    inputs = {path}
    for entry in protocol["inputs"]:
        relative = PurePosixPath(entry)
        if (
            relative.is_absolute()
            or not relative.parts
            or relative.parts[0] == "runs"
            or ".." in relative.parts
            or "\\" in entry
        ):
            raise ValueError(f"Entrée hors des sources du défi : {entry}")
        source = f"{benchmark}/{relative}"
        if entry.endswith("/"):
            matches = {file for file in files if file.startswith(f"{source}/")}
        else:
            matches = {source} & files
        if not matches:
            raise ValueError(f"Entrée du protocole introuvable : {entry}")
        inputs.update(matches)
    return protocol, fingerprints(inputs, normalize_text=True)


def fingerprints(paths, *, normalize_text=False):
    hashes = {}
    for path in sorted(paths):
        content = read_file(path)
        if normalize_text and b"\0" not in content:
            try:
                content.decode("utf-8")
            except UnicodeDecodeError:
                pass
            else:
                content = content.replace(b"\r\n", b"\n")
        hashes[path] = hashlib.sha256(content).hexdigest()
    return hashes


def validate_metadata(run, protocol):
    for field in ("date", "model", "runner", "environment", "launch"):
        if not nonempty_string(run.get(field)):
            raise ValueError(f"{field} doit être renseigné")
    if date.fromisoformat(run["date"]).isoformat() != run["date"]:
        raise ValueError("date doit suivre le format AAAA-MM-JJ")
    for field in ("effort", "reportedModel"):
        if field not in run or (run[field] is not None and not nonempty_string(run[field])):
            raise ValueError(f"{field} doit contenir du texte ou null")

    for field in ("durationSeconds", "humanWaitSeconds"):
        if field not in run or (run[field] is not None and (type(run[field]) is not int or run[field] < 0)):
            raise ValueError(f"{field} doit être un nombre entier de secondes positif ou nul, ou null")
    duration, waiting = run["durationSeconds"], run["humanWaitSeconds"]
    if duration is not None and waiting is not None and waiting > duration:
        raise ValueError("L’attente humaine dépasse la durée totale")

    step_count = len(protocol["steps"])
    steps_run = run.get("stepsRun")
    if type(steps_run) is not int or not 0 <= steps_run <= step_count:
        raise ValueError(f"stepsRun doit être un entier entre 0 et {step_count}")
    if run.get("status") not in ("completed", "partial", "failed"):
        raise ValueError("status doit valoir completed, partial ou failed")
    if run["status"] == "completed" and steps_run != step_count:
        raise ValueError("Un essai terminé doit avoir suivi toutes les étapes")

    deviations = run.get("deviations")
    if not isinstance(deviations, list) or not all(map(nonempty_string, deviations)):
        raise ValueError("deviations doit lister les écarts, ou être un tableau vide")
    if "effort" in protocol and run["effort"] != protocol["effort"] and not deviations:
        raise ValueError(f"Effort attendu : {protocol['effort']}. Documentez l’écart dans deviations.")


def validate_run(folder, files, protocol, inputs, *, record):
    manifest = f"{folder}/run.json"
    transcript = f"{folder}/transcript.md"
    run = read_object(manifest)
    validate_metadata(run, protocol)
    if transcript not in files or not read_file(transcript).decode("utf-8").strip():
        raise ValueError("Une trace transcript.md en UTF-8 est requise")

    outputs = {file for file in files if file.startswith(f"{folder}/output/")}
    if run["status"] == "completed" and not outputs:
        raise ValueError("Un essai terminé doit livrer des fichiers dans output/")
    unexpected = files - outputs - {manifest, transcript}
    if unexpected:
        raise ValueError(f"Fichiers hors de output/ : {', '.join(sorted(unexpected))}")

    hashes = {
        "inputs": inputs,
        "transcript": fingerprints([transcript])[transcript],
        "outputs": fingerprints(outputs),
    }
    if record:
        run["hashes"] = hashes
        (ROOT / manifest).write_text(json.dumps(run, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    elif run.get("hashes") != hashes:
        raise ValueError("Empreintes absentes ou différentes. Vérifiez les fichiers et la trace avant de relancer --record.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record", type=Path, metavar="RUN_JSON", help="écrire les empreintes de cette fiche")
    args = parser.parse_args()
    target = args.record.resolve().relative_to(ROOT).as_posix() if args.record else None

    listing = subprocess.check_output(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=ROOT)
    files = set(listing.decode("utf-8").split("\0")) - {""}
    scenarios = {
        "/".join(PurePosixPath(file).parts[:2])
        for file in files
        if file.startswith("benchmarks/") and len(PurePosixPath(file).parts) > 2
    }
    checked = 0
    failed = 0
    for benchmark in sorted(BUILT_IN | scenarios):
        if target and not target.startswith(f"{benchmark}/runs/"):
            continue
        try:
            protocol, inputs = load_protocol(benchmark, files)
        except (ValueError, OSError) as error:
            print(f"{benchmark} : {error}", file=sys.stderr)
            failed += 1
            continue

        prefix = f"{benchmark}/runs/"
        runs = {}
        for file in files:
            if file.startswith(prefix):
                slug = file[len(prefix):].split("/", 1)[0]
                runs.setdefault(f"{prefix}{slug}", set()).add(file)
        if benchmark in scenarios and not runs:
            print(f"{benchmark} : ajoutez un essai de référence dans runs/", file=sys.stderr)
            failed += 1
        for folder, run_files in sorted(runs.items()):
            if target and target != f"{folder}/run.json":
                continue
            try:
                validate_run(folder, run_files, protocol, inputs, record=bool(target))
                checked += 1
            except (ValueError, OSError) as error:
                print(f"{folder} : {error}", file=sys.stderr)
                failed += 1
    if target and not checked and not failed:
        print("Fiche introuvable. Attendu : <défi>/runs/<identifiant>/run.json", file=sys.stderr)
        return 1
    print(f"{checked} essai(s) vérifié(s), {failed} erreur(s).")
    return int(bool(failed))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
