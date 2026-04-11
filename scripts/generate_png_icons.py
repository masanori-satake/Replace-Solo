import os
import sys
import re
import argparse

def generate_icons(output_dir=None, bg_color=None, grayscale=False):
    # Use script file location as base to make it more robust
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    svg_path = os.path.join(base_dir, 'projects/app/assets/icons/icon.svg')
    output_dir = output_dir or os.path.join(base_dir, 'projects/app/assets/icons')

    if not os.path.exists(svg_path):
        print(f"Error: {svg_path} not found.")
        return False

    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_content = f.read()

    if bg_color:
        # Improved replacement logic using regex to identify the background rect (512x512)
        pattern = r'(<rect\s+[^>]*width="512"\s+[^>]*height="512"\s+[^>]*fill=")([^"]+)(")'
        if re.search(pattern, svg_content):
            svg_content = re.sub(pattern, rf'\1{bg_color}\3', svg_content)
            print(f"Background color dynamically changed to {bg_color}")
        else:
            svg_content = re.sub(r'(<rect\s+[^>]*fill=")([^"]+)(")', rf'\1{bg_color}\3', svg_content, count=1)
            print(f"Background color changed to {bg_color} (using fallback regex)")

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

        filter_style = "filter: grayscale(100%);" if grayscale else ""
        page.set_content(f"""
            <style>
              body, html {{ margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }}
              svg {{ width: 100%; height: 100%; display: block; {filter_style} }}
            </style>
        """ + svg_content)

        suffix = "_gray" if grayscale else ""

        for size in [16, 32, 48, 128]:
            output_path = os.path.join(output_dir, f"icon{size}{suffix}.png")
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
    parser = argparse.ArgumentParser(description='Generate PNG icons from SVG.')
    parser.add_argument('--output-dir', help='Output directory for icons')
    parser.add_argument('--bg-color', help='Background color for the icon')
    parser.add_argument('--gray', action='store_true', help='Generate grayscale icons')

    args = parser.parse_args()

    if generate_icons(args.output_dir, args.bg_color, args.gray):
        exit(0)
    else:
        exit(1)
