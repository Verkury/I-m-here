class PresenceCheckAutoClicker {
    constructor() {
        this.enabled = true;
        this.stats = {
            checksCount: 0,
            lastCheck: null,
            isActive: false
        };
        this.observer = null;
        this.lastPopupTime = 0;
        this.init();
    }

    async init() {
        await this.loadSettings();
        console.log(`Автокликер проверки присутствия ${this.enabled ? 'активирован' : 'выключен'}`);
        this.setupMessageListener();
        this.startDOMObserver();
        this.startPeriodicCheck();
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['enabled', 'checksCount']);
            this.enabled = result.enabled !== false;
            this.stats.checksCount = result.checksCount || 0;
        } catch (error) {
            console.log('Ошибка загрузки настроек:', error);
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.local.set({
                enabled: this.enabled,
                checksCount: this.stats.checksCount
            });
        } catch (error) {
            console.log('Ошибка сохранения настроек:', error);
        }
    }

    async saveStats() {
        try {
            this.stats.lastCheck = new Date().toISOString();
            await chrome.storage.local.set({
                checksCount: this.stats.checksCount,
                lastCheck: this.stats.lastCheck
            });
        } catch (error) {
            console.log('Ошибка сохранения статистики:', error);
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Получено сообщение:', request.type);
            
            switch (request.type) {
                case 'TOGGLE_ENABLED':
                    this.enabled = request.enabled;
                    console.log(`Автокликер ${this.enabled ? 'включен' : 'выключен'}`);
                    this.saveSettings();
                    sendResponse({success: true});
                    break;
                    
                case 'TEST_CLICK':
                    console.log('Тестовый клик');
                    this.testClick();
                    sendResponse({success: true});
                    break;
                    
                case 'RESET_STATS':
                    this.stats.checksCount = 0;
                    this.stats.lastCheck = null;
                    this.saveStats();
                    console.log('Статистика сброшена');
                    sendResponse({success: true});
                    break;
                    
                case 'GET_STATUS':
                    sendResponse({
                        enabled: this.enabled,
                        checksCount: this.stats.checksCount,
                        lastCheck: this.stats.lastCheck,
                        isActive: this.stats.isActive
                    });
                    break;
                    
                default:
                    sendResponse({success: false, error: 'Unknown message type'});
            }
            
            return true;
        });
    }

    async clickPresenceButton() {
        if (!this.enabled) {
            console.log('Автокликер выключен, пропускаем клик');
            return false;
        }

        const now = Date.now();
        if (now - this.lastPopupTime < 10000) {
            console.log('Слишком рано после последнего клика, пропускаем');
            return false;
        }

        let clicked = false;
        console.log('Ищу кнопку подтверждения присутствия...');

        if (typeof $ !== 'undefined') {
            const button = $('.check_participant_active_popup_action_wrapper button');
            if (button.length > 0 && this.isValidPresenceButton(button[0])) {
                console.log('Найдена кнопка через jQuery, нажимаю...');
                button.trigger('click');
                clicked = true;
            }
        }

        if (!clicked) {
            const selectors = [
                '.check_participant_active_popup_action_wrapper .pruffme_button',
                '.check_participant_active_popup_action_wrapper button',
                '#participant_check_active_popup .pruffme_button',
                '#participant_check_active_popup button'
            ];

            for (const selector of selectors) {
                const button = document.querySelector(selector);
                if (button && this.isValidPresenceButton(button)) {
                    console.log(`Найдена кнопка через селектор: ${selector}, нажимаю...`);
                    button.click();
                    
                    setTimeout(() => {
                        if (button && !button.disabled) {
                            const event = new MouseEvent('click', {
                                view: window,
                                bubbles: true,
                                cancelable: true
                            });
                            button.dispatchEvent(event);
                        }
                    }, 100);
                    
                    clicked = true;
                    break;
                }
            }
        }

        if (!clicked) {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
                const text = button.textContent.toLowerCase();
                if ((text.includes('я здесь') || text.includes('подтвердить присутствие')) && 
                    this.isValidPresenceButton(button)) {
                    console.log('Найдена кнопка по тексту, нажимаю...');
                    button.click();
                    clicked = true;
                    break;
                }
            }
        }

        if (clicked) {
            this.stats.checksCount++;
            this.stats.isActive = true;
            this.lastPopupTime = now;
            await this.saveStats();
            console.log(`Обработано проверок: ${this.stats.checksCount}`);
            
            setTimeout(() => {
                this.stats.isActive = false;
            }, 5000);
        } else {
            console.log('Кнопка не найдена');
        }

        return clicked;
    }

    isValidPresenceButton(button) {
        if (!button || button.disabled) return false;
        
        if (button.offsetParent === null) return false;
        
        const popup = button.closest('#participant_check_active_popup');
        if (!popup) return false;
        
        const style = window.getComputedStyle(popup);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        
        return true;
    }

    testClick() {
        console.log('Выполняю тестовый клик...');
        this.clickPresenceButton();
    }

    isPopupVisible() {
        const popup = document.getElementById('participant_check_active_popup');
        if (!popup) return false;
        
        const style = window.getComputedStyle(popup);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    startDOMObserver() {
        try {
            this.observer = new MutationObserver((mutations) => {
                if (!this.enabled) return;

                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1) {
                                if (this.checkForPresencePopup(node)) {
                                    console.log('Обнаружено окно проверки через MutationObserver');
                                    this.handlePopupAppearance();
                                    return;
                                }
                            }
                        }
                    }
                    
                    if (mutation.type === 'attributes' && 
                        mutation.target.id === 'participant_check_active_popup' &&
                        mutation.attributeName === 'style') {
                        if (this.isPopupVisible()) {
                            console.log('Окно проверки стало видимым');
                            this.handlePopupAppearance();
                        }
                    }
                }
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class'],
                attributeOldValue: true
            });
            
            console.log('Наблюдатель DOM активирован');
        } catch (error) {
            console.log('Ошибка инициализации наблюдателя DOM:', error);
        }
    }

    checkForPresencePopup(element) {
        if (element.id === 'participant_check_active_popup') return true;
        
        if (element.classList && (
            element.classList.contains('pruffme_modal_outer') ||
            element.classList.contains('check_participant_active_popup_action_wrapper')
        )) {
            return true;
        }
        
        if (element.querySelector && element.querySelector('#participant_check_active_popup')) {
            return true;
        }
        
        return false;
    }

    handlePopupAppearance() {
        if (!this.enabled) return;
        
        const now = Date.now();
        if (now - this.lastPopupTime < 10000) {
            console.log('Слишком частые вызовы, пропускаем');
            return;
        }
        
        console.log('Обнаружено окно проверки присутствия');
        
        setTimeout(() => {
            this.clickPresenceButton();
        }, 1000);
    }

    startPeriodicCheck() {
        setTimeout(() => {
            if (this.enabled) {
                console.log('Первоначальная проверка на наличие попапа...');
                if (this.isPopupVisible()) {
                    this.handlePopupAppearance();
                }
            }
        }, 5000);

        setInterval(() => {
            if (this.enabled) {
                if (this.isPopupVisible()) {
                    console.log('Периодическая проверка: попап найден');
                    this.handlePopupAppearance();
                }
            }
        }, 15000);
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            console.log('Наблюдатель DOM остановлен');
        }
    }
}

let autoClicker;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        autoClicker = new PresenceCheckAutoClicker();
    });
} else {
    autoClicker = new PresenceCheckAutoClicker();
}