document.addEventListener('DOMContentLoaded', async function() {
    const toggleEnabled = document.getElementById('toggleEnabled');
    const statusTitle = document.getElementById('statusTitle');
    const statusDescription = document.getElementById('statusDescription');
    const checksCount = document.getElementById('checksCount');
    const lastCheck = document.getElementById('lastCheck');
    const currentStatus = document.getElementById('currentStatus');
    const testBtn = document.getElementById('testBtn');
    const resetBtn = document.getElementById('resetBtn');
    const statusContainer = document.getElementById('statusContainer');

    const result = await chrome.storage.local.get(['enabled', 'checksCount', 'lastCheck']);
    const enabled = result.enabled !== false;
    
    updateUI(enabled, result.checksCount || 0, result.lastCheck);

    toggleEnabled.addEventListener('change', async function() {
        const newEnabled = this.checked;
        await chrome.storage.local.set({ enabled: newEnabled });
        
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        chrome.tabs.sendMessage(tab.id, {
            type: 'TOGGLE_ENABLED',
            enabled: newEnabled
        });
        
        updateUI(newEnabled);
    });

    testBtn.addEventListener('click', async function() {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        chrome.tabs.sendMessage(tab.id, {
            type: 'TEST_CLICK'
        });
    });

    resetBtn.addEventListener('click', async function() {
        await chrome.storage.local.set({ 
            checksCount: 0,
            lastCheck: null
        });
        
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        chrome.tabs.sendMessage(tab.id, {
            type: 'RESET_STATS'
        });
        
        updateUI(toggleEnabled.checked, 0, null);
    });

    function updateUI(enabled, count = 0, lastCheckTime = null) {
        toggleEnabled.checked = enabled;
        
        if (enabled) {
            statusTitle.textContent = 'Обход включен';
            statusDescription.textContent = 'Автоматически нажимает кнопки';
            statusContainer.classList.add('status-active');
            statusContainer.classList.remove('status-inactive');
        } else {
            statusTitle.textContent = 'Обход выключен';
            statusDescription.textContent = 'Нажмите для включения';
            statusContainer.classList.add('status-inactive');
            statusContainer.classList.remove('status-active');
        }
        
        checksCount.textContent = count;
        currentStatus.textContent = enabled ? 'Активно' : 'Не активно';
        
        if (lastCheckTime) {
            const date = new Date(lastCheckTime);
            lastCheck.textContent = date.toLocaleTimeString();
        } else {
            lastCheck.textContent = '-';
        }
    }

    setInterval(async () => {
        const result = await chrome.storage.local.get(['checksCount', 'lastCheck']);
        checksCount.textContent = result.checksCount || 0;
        
        if (result.lastCheck) {
            const date = new Date(result.lastCheck);
            lastCheck.textContent = date.toLocaleTimeString();
        }
    }, 1000);
});