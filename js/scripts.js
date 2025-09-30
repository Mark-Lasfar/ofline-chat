import { App } from '@capacitor/app';

// Copy Code
function copyCode(button) {
    const code = button.previousElementSibling.querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        button.textContent = 'Copied!';
        setTimeout(() => button.textContent = 'Copy', 2000);
    });
}

// Redirect to /gradio with loading animation
document.getElementById('chatbot-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const btn = e.target;
    btn.querySelector('.loading').classList.remove('hidden');
    btn.disabled = true;
    setTimeout(() => {
        window.location.href = '/gradio';
    }, 1000); 
});

// Card animations
document.querySelectorAll('.feature-card, .footer-card, .news-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        card.style.transform = 'scale(1.05) rotate(1deg)';
    });
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'scale(1) rotate(0deg)';
    });
});

// Sidebar toggle for mobile
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('.sidebar-toggle');
    
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            console.log('Sidebar toggled'); // Debugging
        });
    } else {
        console.warn('Sidebar or toggle button not found');
    }
});


