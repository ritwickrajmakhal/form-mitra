// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Listen for screenshot capture requests from the side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture_screenshot') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) {
        sendResponse({ error: 'No active tab found', title: 'Active Tab' });
        return;
      }
      const title = activeTab.title || 'Active Tab';

      try {
        // 1. Retrieve page dimensions
        const dimensionsResults = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => {
            const originalOverflow = document.documentElement.style.overflow;
            document.documentElement.style.overflow = 'hidden';
            
            return {
              scrollHeight: Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.offsetHeight,
                document.body.clientHeight,
                document.documentElement.clientHeight
              ),
              clientHeight: window.innerHeight,
              clientWidth: window.innerWidth,
              originalOverflow,
              devicePixelRatio: window.devicePixelRatio || 1
            };
          }
        });

        const dimensions = dimensionsResults[0]?.result;
        if (!dimensions) {
          throw new Error('Failed to resolve page dimensions');
        }

        const { scrollHeight, clientHeight, clientWidth, originalOverflow, devicePixelRatio } = dimensions;

        // 2. Loop scrolling and capturing viewports
        const viewports = [];
        let currentScroll = 0;

        // Scroll to top first
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => window.scrollTo(0, 0)
        });
        await new Promise(r => setTimeout(r, 100)); // Brief delay for scroll rendering

        while (currentScroll < scrollHeight) {
          // Scroll to position
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: (y) => window.scrollTo(0, y),
            args: [currentScroll]
          });

          // Brief delay for page layout rendering/rendering updates
          await new Promise(r => setTimeout(r, 150));

          // Capture visible area
          const dataUrl = await new Promise((resolve) => {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
              if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                resolve(null);
              } else {
                resolve(url);
              }
            });
          });

          if (dataUrl) {
            viewports.push({
              y: currentScroll,
              dataUrl
            });
          }

          if (currentScroll + clientHeight >= scrollHeight) {
            break;
          }
          currentScroll += clientHeight;
          if (currentScroll + clientHeight > scrollHeight) {
            currentScroll = scrollHeight - clientHeight;
          }
        }

        // 3. Restore scrollbar and scroll position
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (overflow) => {
            document.documentElement.style.overflow = overflow;
          },
          args: [originalOverflow]
        });

        sendResponse({
          title,
          viewports,
          scrollHeight,
          clientWidth,
          clientHeight,
          devicePixelRatio
        });

      } catch (err) {
        console.error('Failed full page screenshot:', err);
        sendResponse({ error: err.message, title });
      }
    });
    return true; // Keep message port open for async response
  }
});
