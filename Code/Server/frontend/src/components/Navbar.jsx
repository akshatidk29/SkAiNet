import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Radio, Home, Layers, Menu, X, Signal, Sun, Moon } from 'lucide-react';
import { useMessageStore } from '../store/useMessageStore';

const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const location = useLocation();
    const { messages, error } = useMessageStore();

    const isConnected = !error && messages.length >= 0;

    const navLinks = [
        { path: '/', name: 'Dashboard', icon: Home },
        { path: '/concentration-map', name: 'Concentration Map', icon: Layers }
    ];

    const isActive = (path) => location.pathname === path;

    // Sync dark mode with local storage
    useEffect(() => {
        const savedMode = localStorage.getItem('darkMode') === 'true';
        setDarkMode(savedMode);
    }, []);

    const toggleDarkMode = () => {
        const newMode = !darkMode;
        setDarkMode(newMode);
        localStorage.setItem('darkMode', newMode);
        document.documentElement.classList.toggle('dark', newMode);
    };

    const bgClass = darkMode ? 'bg-slate-800' : 'bg-white';
    const borderClass = darkMode ? 'border-slate-700' : 'border-slate-200';
    const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
    const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-500';

    return (
        <nav className={`${bgClass} border-b ${borderClass} sticky top-0 z-50 shadow-sm transition-colors duration-200`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="flex items-center justify-between h-16">
                    {/* Logo & Brand */}
                    <Link to="/" className="flex items-center space-x-3 group">
                        <div className="relative">
                            <div className={`${darkMode ? 'bg-blue-900/30 border-blue-800' : 'bg-blue-50 border-blue-100'} p-2.5 rounded-xl border group-hover:bg-blue-100 ${darkMode ? 'group-hover:bg-blue-900/50' : ''} transition-all`}>
                                <Radio className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                            </div>
                            <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'} rounded-full ring-2 ${darkMode ? 'ring-slate-800' : 'ring-white'} ${isConnected ? 'animate-pulse' : ''}`}></div>
                        </div>
                        <div className="hidden sm:block">
                            <h1 className={`text-lg font-bold ${textPrimary}`}>skAiNet</h1>
                            <p className={`text-xs ${textSecondary} font-medium -mt-1`}>Disaster Response</p>
                        </div>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center space-x-2">
                        {navLinks.map((link) => {
                            const Icon = link.icon;
                            return (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                                        isActive(link.path)
                                            ? darkMode 
                                                ? 'bg-blue-900/30 text-blue-300 border border-blue-700'
                                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                                            : darkMode
                                                ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-100 border border-transparent'
                                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    <span>{link.name}</span>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Right Side Controls */}
                    <div className="flex items-center space-x-2 sm:space-x-3">
                        {/* Dark Mode Toggle */}
                        <button
                            onClick={toggleDarkMode}
                            className={`p-2.5 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 hover:bg-slate-600' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'} transition-all`}
                        >
                            {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
                        </button>

                        {/* Status Indicator - Desktop */}
                        <div className={`hidden md:flex items-center space-x-2 px-3 py-2 rounded-xl border ${
                            isConnected 
                                ? darkMode ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : darkMode ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                            <Signal className="w-4 h-4" />
                            <span className="text-sm font-semibold">{isConnected ? 'Live' : 'Offline'}</span>
                        </div>

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className={`md:hidden p-2 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'} transition-colors`}
                        >
                            {isOpen ? (
                                <X className={`w-6 h-6 ${textSecondary}`} />
                            ) : (
                                <Menu className={`w-6 h-6 ${textSecondary}`} />
                            )}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isOpen && (
                    <div className={`md:hidden py-4 border-t ${borderClass}`}>
                        <div className="flex flex-col space-y-2">
                            {navLinks.map((link) => {
                                const Icon = link.icon;
                                return (
                                    <Link
                                        key={link.path}
                                        to={link.path}
                                        onClick={() => setIsOpen(false)}
                                        className={`flex items-center space-x-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                                            isActive(link.path)
                                                ? darkMode
                                                    ? 'bg-blue-900/30 text-blue-300 border border-blue-700'
                                                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                                                : darkMode
                                                    ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-100 border border-transparent'
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                                        }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        <span>{link.name}</span>
                                    </Link>
                                );
                            })}
                            
                            {/* Status - Mobile */}
                            <div className={`flex items-center space-x-2 px-4 py-3 rounded-xl border mt-2 ${
                                isConnected 
                                    ? darkMode ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : darkMode ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                                <Signal className="w-4 h-4" />
                                <span className="text-sm font-semibold">{isConnected ? 'System Live' : 'System Offline'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
};

export default Navbar;