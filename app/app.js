const { ipcRenderer } = require('electron');
const { remote } = require('electron');


// Elementy DOM
const versionSpan = document.getElementById('version');
const releaseSpan = document.getElementById('release');
const updateBtn = document.getElementById('update');
const runBtn = document.getElementById('run');
const notInstalledSection = document.getElementById('notinstalled');
const installingSection = document.getElementById('installing');
const installedSection = document.getElementById('installed');

// Sprawdzanie wersji
async function checkVersion() {
    try {
      const versionInfo = await ipcRenderer.invoke('check-version');
      
      versionSpan.innerText = versionInfo.version;
      releaseSpan.innerText = versionInfo.release;
      
      if (versionInfo.updateNeeded) {
        updateBtn.innerText = '';
        updateBtn.disabled = false;
        showToast('A new version is available.', 'info');
      } else {
        notInstalledSection.style.display = 'none';
        installedSection.style.display = 'block';
        showToast('The application is up-to-date!', 'success');
      }
    } catch (error) {
      showToast('Error while checking version.', 'error');
      console.error('Error checking version:', error);
    }
  }
  
  checkVersion();
  
// Obsługa przycisku aktualizacji
updateBtn.addEventListener('click', async () => {
    notInstalledSection.style.display = 'none';
    installingSection.style.display = 'block';
    
    try {
      const result = await ipcRenderer.invoke('start-update');
      if (result.success) {
        installingSection.style.display = 'none';
        installedSection.style.display = 'block';
        showToast('Update completed successfully.', 'success');
      }
    } catch (error) {
      installingSection.style.display = 'none';
      notInstalledSection.style.display = 'block';
      showToast('Error during update.', 'error');
      console.error('Error during update:', error);
    }
  });
  

// Obsługa przycisku uruchomienia aplikacji
runBtn.addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('run-app');
      showToast('Application started.', 'success');
    } catch (error) {
      showToast('Error starting application.', 'error');
      console.error('Error starting application:', error);
    }
  });
  

// Funkcja pomocnicza do wyświetlania Toastów
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = `toast-${Date.now()}`;
    
    // Settings based on type
    let bgClass = 'text-bg-success';
    let iconHtml = '<i class="fa-solid fa-check-circle me-2"></i>';
    
    if (type === 'error') {
      bgClass = 'text-bg-danger';
      iconHtml = '<i class="fa-solid fa-xmark-circle me-2"></i>';
    } else if (type === 'info') {
      bgClass = 'text-bg-info';
      iconHtml = '<i class="fa-solid fa-info-circle me-2"></i>';
    }
    
    const toastHtml = `
      <div id="${toastId}" class="toast align-items-center ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body">
            ${iconHtml} ${message}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    const toastElement = document.getElementById(toastId);
    const bsToast = new bootstrap.Toast(toastElement, { delay: 5000 });
    bsToast.show();
  
    toastElement.addEventListener('hidden.bs.toast', () => {
      toastElement.remove();
    });
  }
  

  document.addEventListener("DOMContentLoaded", () => {
    const minimizeBtn = document.getElementById("minimizeBtn");
    const closeBtn = document.getElementById("closeBtn");

    if (minimizeBtn && closeBtn) {
        minimizeBtn.addEventListener("click", () => {
            console.log("Minimize clicked");
            ipcRenderer.send("window-minimize");
        });

        closeBtn.addEventListener("click", () => {
            console.log("Close clicked");
            ipcRenderer.send("window-close");
        });
    } else {
        console.error("Buttons not found!");
    }
});