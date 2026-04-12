import os
from playwright.sync_api import sync_playwright

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 800, 'height': 600})
        page = context.new_page()

        abs_path = os.path.abspath("projects/app/assets/icons/icon128.png")
        abs_path_gray = os.path.abspath("projects/app/assets/icons/icon128_gray.png")

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ background-color: #121212; color: #fff; margin: 0; padding: 50px; font-family: sans-serif; }}
                .box {{ display: inline-block; padding: 20px; background-color: #000; border: 1px solid #333; margin: 10px; }}
                img {{ width: 128px; height: 128px; display: block; }}
                h2 {{ margin-top: 0; font-size: 16px; }}
            </style>
        </head>
        <body>
            <div class="box">
                <h2>Icon 128 (on Black)</h2>
                <img src="file://{abs_path}">
            </div>
            <div class="box">
                <h2>Icon 128 Gray (on Black)</h2>
                <img src="file://{abs_path_gray}">
            </div>
        </body>
        </html>
        """
        page.set_content(html_content)
        # Wait a bit for images to load
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/screenshots/transparency_final.png")
        browser.close()

if __name__ == "__main__":
    os.makedirs("verification/screenshots", exist_ok=True)
    verify()
