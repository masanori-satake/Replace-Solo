import json
import os
import sys

def verify_no_production_dependencies():
    package_json_path = "package.json"

    if not os.path.exists(package_json_path):
        print(f"Error: {package_json_path} not found.")
        return False

    with open(package_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Check for 'dependencies' key
    if "dependencies" in data:
        deps = data["dependencies"]
        if isinstance(deps, dict) and len(deps) > 0:
            print("Error: Production dependencies found in package.json:")
            for pkg, version in deps.items():
                print(f"  - {pkg}: {version}")
            return False
        elif not isinstance(deps, dict):
            print(f"Error: 'dependencies' key exists but is not a dictionary. Type: {type(deps)}")
            return False

    print("Verification Success: No production dependencies found in package.json.")
    return True

if __name__ == "__main__":
    if verify_no_production_dependencies():
        sys.exit(0)
    else:
        sys.exit(1)
