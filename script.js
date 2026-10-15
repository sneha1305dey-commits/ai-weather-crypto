const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatContainer = document.getElementById('chat-container');
const sendBtn = document.getElementById('send-btn');
const resetBtn = document.getElementById('reset-btn');

// Unique session ID stored in browser session storage
let sessionId = sessionStorage.getItem('chatSessionId');
if (!sessionId) {
  sessionId = 'sess_' + Math.random().toString(36).substring(2, 9);
  sessionStorage.setItem('chatSessionId', sessionId);
}

function appendMessage(content, role) {
  const msg = document.createElement('div');
  msg.className = `message ${role}`;

  if (role === 'bot') {
    // Render markdown for lists, bolding, and tables returned by Gemini
    msg.innerHTML = marked.parse(content);
  } else {
    msg.textContent = content;
  }

  chatContainer.appendChild(msg);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return msg;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  // Render user bubble
  appendMessage(message, 'user');
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;

  // Add loading indicator
  const loader = document.createElement('div');
  loader.className = 'loading';
  loader.innerHTML = '<span class="dot-pulse">● Searching tools and thinking...</span>';
  chatContainer.appendChild(loader);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    const res = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId })
    });

    const data = await res.json();
    loader.remove();

    if (data.reply) {
      appendMessage(data.reply, 'bot');
    } else {
      appendMessage(data.error || 'Something went wrong.', 'bot');
    }
  } catch (err) {
    loader.remove();
    appendMessage('Error: Unable to connect to the backend server.', 'bot');
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
});

// Clear conversation
resetBtn.addEventListener('click', async () => {
  await fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  chatContainer.innerHTML = `
    <div class="message bot welcome">
      <h3>Chat Reset! 👋</h3>
      <p>Ask a question about weather or cryptocurrencies.</p>
    </div>
  `;
});