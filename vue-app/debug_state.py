import asyncio
from playwright.async_api import async_playwright
import json

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("http://localhost:5174/")
        await asyncio.sleep(2)
        
        # Extract messages from localStorage
        data = await page.evaluate("localStorage.getItem('chat_history')")
        if data:
            try:
                msgs = json.loads(data)
                for i, m in enumerate(msgs[-4:]):
                    print(f"MSG {i}: ROLE={m.get('role')} CONTENT={m.get('content')[:100]}...")
            except Exception as e:
                print("Parse error:", e)
        else:
            print("No chat_history in localStorage")
            
        # Also check current agent and workflow
        agent = await page.evaluate("localStorage.getItem('selected_agent')")
        wf = await page.evaluate("localStorage.getItem('selected_workflow')")
        print("AGENT:", agent)
        print("WORKFLOW:", wf)
        
        await browser.close()

asyncio.run(main())
