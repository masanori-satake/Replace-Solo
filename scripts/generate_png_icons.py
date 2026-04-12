import os
import base64
import argparse
from playwright.sync_api import sync_playwright

def generate_icons(output_dir=None, grayscale=False):
    """
    Generates standard Chrome extension icons (16, 32, 48, 128) from a master icon.png.
    Removes excess margins and applies a rounded corner (20%) effect.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icon_path = os.path.join(base_dir, 'projects/app/assets/icons/icon.png')
    output_dir = output_dir or os.path.join(base_dir, 'projects/app/assets/icons')

    if not os.path.exists(icon_path):
        print(f"Error: Master icon not found at {icon_path}")
        return False

    with open(icon_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Load the image to analyze it
        page.set_content(f"""
            <html>
            <body style="margin: 0; padding: 0; background: transparent;">
                <img id="source" src="data:image/png;base64,{encoded_string}">
            </body>
            </html>
        """)

        # Ensure image is loaded and get natural dimensions
        dimensions = page.evaluate("""() => {
            const img = document.getElementById('source');
            return new Promise(resolve => {
                if (img.complete) resolve({w: img.naturalWidth, h: img.naturalHeight});
                else img.onload = () => resolve({w: img.naturalWidth, h: img.naturalHeight});
            });
        }""")

        img_w = dimensions['w']
        img_h = dimensions['h']

        # JS to find bounding box by detecting background color from corners
        bbox = page.evaluate("""() => {
            const img = document.getElementById('source');
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Sample corners to detect background (assuming background is uniform)
            const corners = [
                [0, 0], [canvas.width - 1, 0],
                [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1]
            ];
            const bgSamples = corners.map(([x, y]) => {
                const off = (y * canvas.width + x) * 4;
                return { r: data[off], g: data[off+1], b: data[off+2], a: data[off+3] };
            });

            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
            let found = false;

            const isBackground = (r, g, b, a) => {
                // Check if pixel matches any corner sample (with tolerance)
                return bgSamples.some(s =>
                    Math.abs(s.r - r) < 10 &&
                    Math.abs(s.g - g) < 10 &&
                    Math.abs(s.b - b) < 10 &&
                    Math.abs(s.a - a) < 10
                ) || a < 5; // Also treat near-transparent as background
            };

            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const offset = (y * canvas.width + x) * 4;
                    if (!isBackground(data[offset], data[offset+1], data[offset+2], data[offset+3])) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                        found = true;
                    }
                }
            }

            return found ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null;
        }""")

        if not bbox:
            print("Warning: Could not isolate icon from background. Using full image.")
            bbox = { 'x': 0, 'y': 0, 'width': img_w, 'height': img_h }

        print(f"Isolated icon bounding box: {bbox}")

        # Ensure the crop area is square
        size = max(bbox['width'], bbox['height'])
        centerX = bbox['x'] + bbox['width'] / 2
        centerY = bbox['y'] + bbox['height'] / 2

        cropX = centerX - size / 2
        cropY = centerY - size / 2

        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        grayscales = [grayscale] if grayscale else [False, True]

        for gs in grayscales:
            suffix = "_gray" if gs else ""
            filter_style = "filter: grayscale(100%);" if gs else ""

            render_html = f"""
                <html>
                <head>
                <style>
                    body, html {{
                        margin: 0; padding: 0;
                        background: transparent !important;
                        overflow: hidden;
                    }}
                    #container {{
                        position: relative;
                        width: {size}px;
                        height: {size}px;
                        aspect-ratio: 1 / 1;
                        overflow: hidden;
                        border-radius: 20%;
                        {filter_style}
                    }}
                    img {{
                        position: absolute;
                        left: -{cropX}px;
                        top: -{cropY}px;
                        width: {img_w}px;
                        height: {img_h}px;
                        display: block;
                    }}
                </style>
                </head>
                <body>
                    <div id="container">
                        <img src="data:image/png;base64,{encoded_string}">
                    </div>
                </body>
                </html>
            """

            # Generate target sizes
            for s in [16, 32, 48, 128]:
                page.set_content(render_html)
                page.set_viewport_size({"width": s, "height": s})
                scale = s / size
                page.evaluate(f"""
                    const container = document.getElementById('container');
                    container.style.transform = 'scale({scale})';
                    container.style.transformOrigin = '0 0';
                """)

                output_path = os.path.join(output_dir, f"icon{s}{suffix}.png")
                page.screenshot(path=output_path, omit_background=True)
                print(f"Generated: {output_path} ({s}x{s})")

            # Update the master icon.png with the cropped/rounded version (preserving high res)
            if not gs and output_dir.endswith('projects/app/assets/icons'):
                page.set_content(render_html)
                # Use the original detected size (or at least a high-res default like 512)
                master_res = max(int(size), 512)
                page.set_viewport_size({"width": master_res, "height": master_res})
                scale = master_res / size
                page.evaluate(f"document.getElementById('container').style.transform = 'scale({scale})';")
                page.evaluate("document.getElementById('container').style.transformOrigin = '0 0';")

                master_app_path = os.path.join(base_dir, 'projects/app/assets/icons/icon.png')
                page.screenshot(path=master_app_path, omit_background=True)
                print(f"Updated master: {master_app_path} ({master_res}x{master_res})")

        browser.close()
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Automated Icon Generator for Microsoft Loop Replacement Tool.')
    parser.add_argument('--output-dir', type=str, help='Custom output directory (default: projects/app/assets/icons)')
    parser.add_argument('--gray', action='store_true', help='Generate grayscale versions only')
    args = parser.parse_args()

    success = generate_icons(output_dir=args.output_dir, grayscale=args.gray)
    if not success:
        exit(1)
