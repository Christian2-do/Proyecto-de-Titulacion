const firebaseConfig = {
    apiKey: "AIzaSyCciOJxfI7gtUM3XJ8sKCmqW6HAWshUH-A",
    authDomain: "proyecto-de-titulacion-ca25f.firebaseapp.com",
    projectId: "proyecto-de-titulacion-ca25f",
    storageBucket: "proyecto-de-titulacion-ca25f.firebasestorage.app",
    messagingSenderId: "639706107750",
    appId: "1:639706107750:web:cb3a0de8b23469dc2202a7",
    measurementId: "G-SW6DGLJ2ZL"
};

firebase.initializeApp(firebaseConfig);
const firebaseAuth = firebase.auth();
const firebaseDb = firebase.firestore();
