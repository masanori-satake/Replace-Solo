import json
import sys
import re

def check_version():
    try:
        # Load version from version.json
        with open('projects/app/version.json', 'r', encoding='utf-8') as f:
            version = json.load(f).get('version')

        if not version:
            print("Error: version.json is missing version field.")
            return False

        # Load version from package.json
        with open('package.json', 'r', encoding='utf-8') as f:
            package_version = json.load(f).get('version')

        # Load version from manifest.json
        with open('projects/app/manifest.json', 'r', encoding='utf-8') as f:
            manifest_version = json.load(f).get('version')

        # Load version from package-lock.json
        with open('package-lock.json', 'r', encoding='utf-8') as f:
            lock_data = json.load(f)
            lock_version = lock_data.get('version')
            # Check root package version in package-lock.json
            lock_pkg_version = lock_data.get('packages', {}).get('', {}).get('version')

        # Load version from README.md badge
        with open('README.md', 'r', encoding='utf-8') as f:
            readme_content = f.read()
            readme_match = re.search(r'badge/version-(\d+\.\d+\.\d+)-blue', readme_content)
            readme_version = readme_match.group(1) if readme_match else None

        if version != package_version:
            print(f"Error: package.json version ({package_version}) does not match version.json ({version})")
            return False

        if version != manifest_version:
            print(f"Error: manifest.json version ({manifest_version}) does not match version.json ({version})")
            return False

        if version != lock_version:
            print(f"Error: package-lock.json version ({lock_version}) does not match version.json ({version})")
            return False

        if version != lock_pkg_version:
            print(f"Error: package-lock.json packages[''].version ({lock_pkg_version}) does not match version.json ({version})")
            return False

        if version != readme_version:
            print(f"Error: README.md badge version ({readme_version}) does not match version.json ({version})")
            return False

        print(f"Version check passed (v{version}) across 5 files.")
        return True
    except Exception as e:
        print(f"Error during version check: {e}")
        return False

if __name__ == "__main__":
    if not check_version():
        sys.exit(1)
