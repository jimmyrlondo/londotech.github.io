// Firebase web app config for the Kromhard catalog backend.
// Not a secret: this object is meant to be embedded client-side. Real
// access control lives in firestore.rules / storage.rules, not here.
// Shared between the admin app (kromhard/admin/) and the public catalog
// page (kromhard/catalog/) so both read from the same project.
export const firebaseConfig = {
  projectId: "kromhard-catalog",
  appId: "1:892558399859:web:c97ce2ce656778d5bacd06",
  storageBucket: "kromhard-catalog.firebasestorage.app",
  apiKey: "AIzaSyANI2IHiG8q9MNE4cR2OlK_Sb2F-UNuE_Y",
  authDomain: "kromhard-catalog.firebaseapp.com",
  messagingSenderId: "892558399859",
};
