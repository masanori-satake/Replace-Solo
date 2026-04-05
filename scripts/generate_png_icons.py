import os
import sys
import re

def generate_icons(output_dir=None, bg_color=None):
    svg_path = os.path.join(os.getcwd(), 'projects/app/assets/icons/icon.svg')
    if output_dir is None:
        output_dir = os.path.join(os.getcwd(), 'projects/app/assets/icons')

    if not os.path.exists(svg_path):
        print(f"Error: {svg_path} not found.")
        return False

    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_content = f.read()

    if bg_color:
        # Improved replacement logic using regex to identify the background rect (512x512)
        # This ensures we follow the master SVG's structure even if the base color changes.
        # We also support optional attributes like 'rx' or 'class' that might be present.
        pattern = r'(<rect\s+[^>]*width="512"\s+[^>]*height="512"\s+[^>]*fill=")([^"]+)(")'
        if re.search(pattern, svg_content):
            svg_content = re.sub(pattern, rf'\1{bg_color}\3', svg_content)
            print(f"Background color dynamically changed to {bg_color}")
        else:
            # Fallback if the strict pattern doesn't match (e.g. order of attributes)
            # Find the first fill attribute in a rect
            svg_content = re.sub(r'(<rect\s+[^>]*fill=")([^"]+)(")', rf'\1{bg_color}\3', svg_content, count=1)
            print(f"Background color changed to {bg_color} (using fallback regex)")

    # If VERCEL environment is detected, skip generation as it's not needed for the landing page
    # and Playwright might not be installed or configured.
    if os.environ.get('VERCEL') == '1':
        print("Vercel environment detected. Skipping PNG icon generation for extension.")
        return True

    try:
        from playwright.sync_api import sync_playwright
        print("Playwright found. Generating icons...")
    except ImportError:
        print("Error: No module named 'playwright'. Please install it to generate extension icons.")
        return False

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception as e:
            print(f"Error: Failed to launch browser: {e}")
            return False

        context = browser.new_context(
            viewport={'width': 512, 'height': 512},
            device_scale_factor=1
        )
        page = context.new_page()

        page.set_content(f"""
            <style>
              body, html {{ margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }}
              svg {{ width: 100%; height: 100%; display: block; }}
            </style>
            {svg_content}
        """)

        for size in [16, 32, 48, 128]:
            output_path = os.path.join(output_dir, f"icon{size}.png")
            print(f"Generating {size}x{size} icon: {output_path}")

            page.set_viewport_size({'width': size, 'height': size})
            page.screenshot(
                path=output_path,
                omit_background=True,
                clip={'x': 0, 'y': 0, 'width': size, 'height': size}
            )

        browser.close()

    print(f"Icon generation complete in {output_dir}")
    return True

if __name__ == "__main__":
    # Support optional command line arguments: [output_dir] [bg_color]
    target_dir = sys.argv[1] if len(sys.argv) > 1 else None
    color = sys.argv[2] if len(sys.argv) > 2 else None

    if generate_icons(target_dir, color):
        exit(0)
    else:
        exit(1)
