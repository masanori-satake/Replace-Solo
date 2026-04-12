import os
import base64
import argparse
from playwright.sync_api import sync_playwright

def generate_icons(output_dir=None, grayscale=False):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icon_path = os.path.join(base_dir, 'projects/app/assets/icons/icon.png')
    output_dir = output_dir or os.path.join(base_dir, 'projects/app/assets/icons')

    if not os.path.exists(icon_path):
        print(f"Error: {icon_path} not found.")
        return False

    with open(icon_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.set_content(f"""
            <html>
            <body style="margin: 0; padding: 0; background: white;">
                <img id="source" src="data:image/png;base64,{encoded_string}">
            </body>
            </html>
        """)

        # Ensure image is loaded and get dimensions
        dimensions = page.evaluate("""() => {
            const img = document.getElementById('source');
            return new Promise(resolve => {
                if (img.complete) resolve({w: img.naturalWidth, h: img.naturalHeight});
                else img.onload = () => resolve({w: img.naturalWidth, h: img.naturalHeight});
            });
        }""")

        img_w = dimensions['w']
        img_h = dimensions['h']

        # JS to find bounding box
        bbox = page.evaluate("""() => {
            const img = document.getElementById('source');
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
            let found = false;

            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const offset = (y * canvas.width + x) * 4;
                    const r = data[offset];
                    const g = data[offset + 1];
                    const b = data[offset + 2];
                    const a = data[offset + 3];

                    const isWhite = r > 250 && g > 250 && b > 250;
                    const isTransparent = a < 10;

                    if (!isWhite && !isTransparent) {
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
            print("Error: Could not find icon bounding box.")
            browser.close()
            return False

        print(f"Detected bounding box: {bbox}")

        # The icon should be square
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
                <style>
                    body, html {{ margin: 0; padding: 0; background: transparent !important; overflow: hidden; }}
                    #container {{
                        position: relative;
                        width: {size}px;
                        height: {size}px;
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
                    }}
                </style>
                <body>
                    <div id="container">
                        <img src="data:image/png;base64,{encoded_string}">
                    </div>
                </body>
                </html>
            """

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
                print(f"Saved: {output_path}")

            if not gs and output_dir.endswith('projects/app/assets/icons'):
                page.set_content(render_html)
                page.set_viewport_size({"width": 512, "height": 512})
                scale = 512 / size
                page.evaluate(f"""
                    const container = document.getElementById('container');
                    container.style.transform = 'scale({scale})';
                    container.style.transformOrigin = '0 0';
                """)
                master_app_path = os.path.join(base_dir, 'projects/app/assets/icons/icon.png')
                page.screenshot(path=master_app_path, omit_background=True)
                print(f"Updated master: {master_app_path}")

        browser.close()
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate PNG icons.')
    parser.add_argument('--output-dir', help='Output directory for icons')
    parser.add_argument('--gray', action='store_true', help='Generate grayscale icons')
    args = parser.parse_args()
    generate_icons(output_dir=args.output_dir, grayscale=args.gray)
