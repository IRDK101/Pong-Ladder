import { parseFirebaseConfig } from '../scripts/firebase-config.mjs';

const want = { apiKey: 'AIzaFake-123', authDomain: 'pong-z.firebaseapp.com', databaseURL: 'https://pong-z-default-rtdb.firebaseio.com', projectId: 'pong-z', storageBucket: 'pong-z.firebasestorage.app', messagingSenderId: '1234', appId: '1:1234:web:abcd' };

describe('reading the pasted Firebase config', () => {
  it('takes the console snippet as shown, comments, imports and all', () => {
    const snippet = `// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaFake-123",
  authDomain: "pong-z.firebaseapp.com",
  databaseURL: "https://pong-z-default-rtdb.firebaseio.com",
  projectId: 'pong-z',
  storageBucket: "pong-z.firebasestorage.app", /* bucket */
  messagingSenderId: "1234",
  appId: "1:1234:web:abcd",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);`;
    expect(parseFirebaseConfig(snippet)).toEqual(want);
  });
  it('takes plain JSON, and just the object', () => {
    expect(parseFirebaseConfig(JSON.stringify(want))).toEqual(want);
    expect(parseFirebaseConfig(`{ apiKey: "AIzaFake-123", authDomain: "pong-z.firebaseapp.com", databaseURL: "https://pong-z-default-rtdb.firebaseio.com", projectId: "pong-z", storageBucket: "pong-z.firebasestorage.app", messagingSenderId: "1234", appId: "1:1234:web:abcd" }`)).toEqual(want);
  });
  it('explains what is wrong', () => {
    expect(() => parseFirebaseConfig('const firebaseConfig = { apiKey: "x", authDomain: "a", projectId: "p", appId: "1" };')).toThrow(/databaseURL/);
    expect(() => parseFirebaseConfig('const firebaseConfig = { apiKey: "x",')).toThrow(/not closed/);
    expect(() => parseFirebaseConfig('hello')).toThrow(/No \{/);
  });
});
