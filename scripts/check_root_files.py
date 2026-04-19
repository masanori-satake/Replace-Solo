import os
import sys

# List of allowed files and directories in the root directory
ALLOWED_ROOT_ITEMS = {
    ".git",
    ".github",
    ".gitignore",
    ".pre-commit-config.yaml",
    "AGENTS.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "docs",
    "package-lock.json",
    "package.json",
    "scripts",
    "projects",
    "node_modules",
    "releases",
}

def check_root_directory():
    found_unauthorized = False
    root_items = os.listdir(".")

    for item in root_items:
        if item not in ALLOWED_ROOT_ITEMS:
            print(f"Error: Unauthorized item found in root directory: {item}")
            found_unauthorized = True

    if found_unauthorized:
        print("\nCleanup is required. Please remove unauthorized files from the root directory.")
        sys.exit(1)
    else:
        print("Root directory check passed.")

if __name__ == "__main__":
    check_root_directory()
