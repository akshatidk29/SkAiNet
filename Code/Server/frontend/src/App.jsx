import { Routes, Route   } from "react-router-dom";  
import Navbar from "./Components/Navbar";
import LandingPage from './Pages/LandingPage';
import ConcentrationMapPage from './Pages/ConcentrationMapPage';

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
