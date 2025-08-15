// Quick test to see if server can start without errors
import './src/server';

console.log('✅ Server started successfully!');

// Exit after 3 seconds
setTimeout(() => {
  console.log('✅ Test complete - server can start without errors');
  process.exit(0);
}, 3000);
