import json
import sys

def check_version():
    try:
        # Load version from version.json
        # Load version from version.json
        with open('projects/app/version.json', 'r', encoding='utf-8') as f:
            version = json.load(f).get('version')

        # Load version from package.json
        with open('package.json', 'r', encoding='utf-8') as f:
            package_version = json.load(f).get('version')

        # Load version from manifest.json
        with open('projects/app/manifest.json', 'r', encoding='utf-8') as f:
            manifest_version = json.load(f).get('version')

        if not version:
            print("Error: version.json is missing version field.")
            return False

        if version != package_version:
            print(f"Error: package.json version ({package_version}) does not match version.json ({version})")
            return False

        if version != manifest_version:
            print(f"Error: manifest.json version ({manifest_version}) does not match version.json ({version})")
            return False

        print(f"Version check passed (v{version}).")
        return True
    except Exception as e:
        print(f"Error during version check: {e}")
        return False

if __name__ == "__main__":
    if not check_version():
        sys.exit(1)
