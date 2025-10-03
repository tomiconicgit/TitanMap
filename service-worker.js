self.addEventListener('install', event => {
  console.log('Service Worker installing.');
});

self.addEventListener('activate', event => {
  console.log('Service Worker activating.');
});

// Listen for messages from the main page
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { risetime } = event.data;
    const now = Date.now();
    const delay = risetime - now;

    if (delay > 0) {
      setTimeout(() => {
        self.registration.showNotification('ISS Flyover Alert!', {
          body: 'The International Space Station will be visible above you in 5 minutes!',
          icon: 'https://www.gstatic.com/android/keyboard/emojikit/20181001/u1f680.png' // Same icon as manifest
        });
      }, delay);
    }
  }
});
