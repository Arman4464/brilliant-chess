document.addEventListener('DOMContentLoaded', async () => {
  const pageBadge = document.getElementById('page-badge');
  const gameIdText = document.getElementById('game-id-text');
  const reviewStatusText = document.getElementById('review-status-text');
  const extractBtn = document.getElementById('extract-btn');
  const limitNotice = document.getElementById('limit-notice');
  const notChessNotice = document.getElementById('not-chess-notice');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('chess.com')) {
      pageBadge.innerText = 'Not Chess.com';
      pageBadge.className = 'badge inactive';
      reviewStatusText.innerText = 'Not on Chess.com';
      extractBtn.disabled = true;
      notChessNotice.classList.remove('hidden');
      return;
    }

    // Try communicating with content script
    let status;
    try {
      status = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_STATUS' });
    } catch (_) {
      // Content script may need injection if page was loaded before extension
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content/content.css']
      });
      status = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_STATUS' });
    }

    if (!status) {
      reviewStatusText.innerText = 'Unable to read page';
      extractBtn.disabled = true;
      return;
    }

    if (status.gameId) {
      gameIdText.innerText = status.gameId;
    }

    if (status.dailyLimitReached) {
      pageBadge.innerText = 'Limit Reached';
      pageBadge.className = 'badge limit';
      reviewStatusText.innerText = 'Daily Limit Reached';
      extractBtn.disabled = true;
      limitNotice.classList.remove('hidden');
      return;
    }

    if (status.isReviewPage) {
      pageBadge.innerText = 'Review Ready';
      pageBadge.className = 'badge ready';
      reviewStatusText.innerText = 'Game Review Ready';
      extractBtn.disabled = false;
    } else {
      pageBadge.innerText = 'Not on /review';
      pageBadge.className = 'badge inactive';
      reviewStatusText.innerText = 'Open the Review tab';
      extractBtn.disabled = true;
      notChessNotice.classList.remove('hidden');
    }

    extractBtn.addEventListener('click', async () => {
      extractBtn.disabled = true;
      extractBtn.innerText = '⏳ Extracting...';

      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'START_EXTRACTION' });
        if (response && response.success) {
          extractBtn.innerText = '✅ Downloaded!';
          setTimeout(() => {
            extractBtn.disabled = false;
            extractBtn.innerHTML = '<span>📥</span> Extract & Download JSON';
          }, 3000);
        } else if (response && response.error === 'DAILY_LIMIT_REACHED') {
          extractBtn.innerText = '⚠️ Limit Reached';
          limitNotice.classList.remove('hidden');
        } else {
          extractBtn.innerText = '❌ Failed';
          setTimeout(() => {
            extractBtn.disabled = false;
            extractBtn.innerHTML = '<span>📥</span> Extract & Download JSON';
          }, 3000);
        }
      } catch (err) {
        console.error(err);
        extractBtn.innerText = '❌ Error';
        setTimeout(() => {
          extractBtn.disabled = false;
          extractBtn.innerHTML = '<span>📥</span> Extract & Download JSON';
        }, 3000);
      }
    });
  } catch (err) {
    console.error('Popup initialization error:', err);
    reviewStatusText.innerText = 'Error initializing';
  }
});
