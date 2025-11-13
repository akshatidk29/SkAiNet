import { useEffect } from 'react';
import { Routes, Route   } from "react-router-dom";  
import Navbar from "./components/Navbar";
import LandingPage from './pages/LandingPage';
import ConcentrationMapPage from './pages/ConcentrationMapPage';

function App() { 
   
 
  return (
    <div> 
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} /> 
        <Route path="/concentration-map" element={<ConcentrationMapPage />} /> 
      </Routes>
    </div>
  )
}

export default App
