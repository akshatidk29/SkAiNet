import React, { useState, useEffect, useRef } from 'react';
import { useMessageStore } from '../store/useMessageStore';
import { 
    Trash2, Download, Search, Clock, 
    MapPin, AlertTriangle, Info, CheckCircle, 
    Map as MapIcon, Navigation, X,
    Radio
} from 'lucide-react';

const LandingPage = () => {
    const { messages, isFetchingMessages, error, fetchMessages, clearMessages } = useMessageStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [urgencyFilter, setUrgencyFilter] = useState('all');
    const [darkMode, setDarkMode] = useState(false);
    const [showAllMap, setShowAllMap] = useState(false);
    const globalMapRef = useRef(null);
    const cardMapRefs = useRef({});

    // Sync dark mode with navbar
    useEffect(() => {
        const savedMode = localStorage.getItem('darkMode') === 'true';
        setDarkMode(savedMode);
        
        const observer = new MutationObserver(() => {
            const isDark = localStorage.getItem('darkMode') === 'true';
            setDarkMode(isDark);
        });
        
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    // Initial fetch and polling
    useEffect(() => {
        fetchMessages();
        const interval = setInterval(() => {
            fetchMessages();
        }, 2000);
        return () => clearInterval(interval);
    }, [fetchMessages]);

    // Initialize global map
    useEffect(() => {
        if (showAllMap && !globalMapRef.current) {
            setTimeout(() => initGlobalMap(), 100);
        }
    }, [showAllMap]);

    // Update global map when messages change
    useEffect(() => {
        if (showAllMap && globalMapRef.current) {
            updateGlobalMap();
        }
    }, [messages, showAllMap, urgencyFilter, filterType, searchTerm]);

    const initGlobalMap = () => {
        const L = window.L;
        if (!L) return;

        const mapElement = document.getElementById('global-map');
        if (!mapElement) return;

        const map = L.map('global-map').setView([31.78, 77.00], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        globalMapRef.current = map;
        updateGlobalMap();
    };

    const updateGlobalMap = () => {
        if (!globalMapRef.current) return;
        const L = window.L;
        if (!L) return;

        globalMapRef.current.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                globalMapRef.current.removeLayer(layer);
            }
        });

        const messagesWithGPS = filteredMessages.filter(msg => msg.gps);
        
        messagesWithGPS.forEach((msg) => {
            const { latitude, longitude } = msg.gps;
            
            let iconColor = '#3b82f6';
            if (msg.urgency === 'HIGH') iconColor = '#ef4444';
            else if (msg.urgency === 'MEDIUM') iconColor = '#f59e0b';
            else if (msg.urgency === 'LOW') iconColor = '#10b981';

            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background-color: ${iconColor}; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 12px rgba(0,0,0,0.4);"></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const marker = L.marker([latitude, longitude], { icon: customIcon })
                .bindPopup(`
                    <div style="min-width: 200px; font-family: system-ui;">
                        <div style="margin-bottom: 8px;">
                            <strong style="font-size: 14px;">${msg.name || 'Unknown'}</strong>
                            ${msg.urgency ? `<span style="background: ${iconColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 6px;">${msg.urgency}</span>` : ''}
                        </div>
                        <p style="margin: 6px 0; font-size: 12px; color: #666;">${msg.message}</p>
                        <div style="margin-top: 8px; font-size: 11px; color: #999;">
                            Node ${msg.src} → ${msg.cur} | ID: ${msg.msg_id}
                        </div>
                    </div>
                `)
                .addTo(globalMapRef.current);
        });

        if (messagesWithGPS.length > 0) {
            const bounds = L.latLngBounds(messagesWithGPS.map(msg => [msg.gps.latitude, msg.gps.longitude]));
            globalMapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
    };

    const initCardMap = (msgId, latitude, longitude, urgency) => {
        const L = window.L;
        if (!L) return;

        const mapElement = document.getElementById(`map-${msgId}`);
        if (!mapElement || cardMapRefs.current[msgId]) return;

        const map = L.map(`map-${msgId}`).setView([latitude, longitude], 15);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(map);

        let iconColor = '#3b82f6';
        if (urgency === 'HIGH') iconColor = '#ef4444';
        else if (urgency === 'MEDIUM') iconColor = '#f59e0b';
        else if (urgency === 'LOW') iconColor = '#10b981';

        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${iconColor}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        L.marker([latitude, longitude], { icon: customIcon }).addTo(map);
        cardMapRefs.current[msgId] = map;
    };

    // Filter messages
    const filteredMessages = messages.filter(msg => {
        const matchesSearch = searchTerm === '' || 
            msg.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            msg.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            msg.src?.toString().includes(searchTerm) ||
            msg.msg_id?.toString().includes(searchTerm);
        
        const matchesFilter = filterType === 'all' || 
            (filterType === 'withName' && msg.name) ||
            (filterType === 'withoutName' && !msg.name) ||
            (filterType === 'withGPS' && msg.gps);
        
        const matchesUrgency = urgencyFilter === 'all' || 
            msg.urgency === urgencyFilter;
        
        return matchesSearch && matchesFilter && matchesUrgency;
    });

    // Export messages
    const handleExport = () => {
        const dataStr = JSON.stringify(messages, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `disaster_messages_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const getUrgencyStyles = (urgency) => {
        const baseStyles = darkMode 
            ? {
                HIGH: 'bg-red-900/30 border-red-700 text-red-300',
                MEDIUM: 'bg-amber-900/30 border-amber-700 text-amber-300',
                LOW: 'bg-green-900/30 border-green-700 text-green-300',
                default: 'bg-slate-800 border-slate-700 text-slate-300'
              }
            : {
                HIGH: 'bg-red-50 border-red-200 text-red-700',
                MEDIUM: 'bg-amber-50 border-amber-200 text-amber-700',
                LOW: 'bg-green-50 border-green-200 text-green-700',
                default: 'bg-slate-50 border-slate-200 text-slate-700'
              };
        return baseStyles[urgency] || baseStyles.default;
    };

    const getUrgencyIcon = (urgency) => {
        switch (urgency) {
            case 'HIGH': return <AlertTriangle className="w-4 h-4" />;
            case 'MEDIUM': return <Info className="w-4 h-4" />;
            case 'LOW': return <CheckCircle className="w-4 h-4" />;
            default: return null;
        }
    };

    // Statistics
    const stats = {
        high: messages.filter(m => m.urgency === 'HIGH').length,
        medium: messages.filter(m => m.urgency === 'MEDIUM').length,
        low: messages.filter(m => m.urgency === 'LOW').length,
        withGPS: messages.filter(m => m.gps).length
    };

    const bgClass = darkMode ? 'bg-slate-900' : 'bg-slate-50';
    const cardBg = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
    const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
    const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-500';
    const inputBg = darkMode ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200 text-slate-900';

    return (
        <div className={`min-h-screen ${bgClass} transition-colors duration-200`}>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                {/* Error Alert */}
                {error && (
                    <div className={`mb-6 ${darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200'} border p-4 rounded-xl shadow-sm`}>
                        <div className="flex items-center">
                            <div className={`${darkMode ? 'bg-red-900/50' : 'bg-red-100'} p-2 rounded-lg mr-3`}>
                                <AlertTriangle className={`w-5 h-5 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                            </div>
                            <div>
                                <p className={`${darkMode ? 'text-red-300' : 'text-red-900'} font-semibold text-sm`}>Connection Error</p>
                                <p className={`${darkMode ? 'text-red-400' : 'text-red-700'} text-sm mt-0.5`}>{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Statistics Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <div className={`${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs sm:text-sm ${textSecondary} font-medium`}>High Priority</p>
                                <p className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-red-400' : 'text-red-600'} mt-1`}>{stats.high}</p>
                            </div>
                            <div className={`${darkMode ? 'bg-red-900/30' : 'bg-red-50'} p-2 sm:p-3 rounded-lg`}>
                                <AlertTriangle className={`w-5 h-5 sm:w-6 sm:h-6 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                            </div>
                        </div>
                    </div>
                    
                    <div className={`${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs sm:text-sm ${textSecondary} font-medium`}>Medium</p>
                                <p className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-amber-400' : 'text-amber-600'} mt-1`}>{stats.medium}</p>
                            </div>
                            <div className={`${darkMode ? 'bg-amber-900/30' : 'bg-amber-50'} p-2 sm:p-3 rounded-lg`}>
                                <Info className={`w-5 h-5 sm:w-6 sm:h-6 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                            </div>
                        </div>
                    </div>
                    
                    <div className={`${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs sm:text-sm ${textSecondary} font-medium`}>Low Priority</p>
                                <p className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'} mt-1`}>{stats.low}</p>
                            </div>
                            <div className={`${darkMode ? 'bg-green-900/30' : 'bg-green-50'} p-2 sm:p-3 rounded-lg`}>
                                <CheckCircle className={`w-5 h-5 sm:w-6 sm:h-6 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                            </div>
                        </div>
                    </div>
                    
                    <div className={`${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs sm:text-sm ${textSecondary} font-medium`}>GPS Tracked</p>
                                <p className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'} mt-1`}>{stats.withGPS}</p>
                            </div>
                            <div className={`${darkMode ? 'bg-blue-900/30' : 'bg-blue-50'} p-2 sm:p-3 rounded-lg`}>
                                <Navigation className={`w-5 h-5 sm:w-6 sm:h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Controls Bar */}
                <div className={`${cardBg} rounded-xl shadow-sm border p-4 mb-6 transition-colors duration-200`}>
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
                                <input
                                    type="text"
                                    placeholder="Search messages..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${inputBg} transition-colors duration-200`}
                                />
                            </div>
                        </div>

                        {/* Filters */}
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className={`px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer text-sm font-medium ${inputBg} transition-colors duration-200`}
                        >
                            <option value="all">All Messages</option>
                            <option value="withName">With Name</option>
                            <option value="withoutName">Without Name</option>
                            <option value="withGPS">With GPS</option>
                        </select>

                        <select
                            value={urgencyFilter}
                            onChange={(e) => setUrgencyFilter(e.target.value)}
                            className={`px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer text-sm font-medium ${inputBg} transition-colors duration-200`}
                        >
                            <option value="all">All Urgency</option>
                            <option value="HIGH">High</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="LOW">Low</option>
                        </select>

                        {/* Actions */}
                        <button
                            onClick={() => setShowAllMap(!showAllMap)}
                            disabled={messages.filter(m => m.gps).length === 0}
                            className={`flex items-center space-x-2 px-4 py-2.5 ${darkMode ? 'bg-blue-900/30 border-blue-700 hover:bg-blue-900/50 text-blue-300' : 'bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700'} border rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium`}
                        >
                            <MapIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">{showAllMap ? 'Hide' : 'Show'} Map</span>
                        </button>

                        <button
                            onClick={handleExport}
                            disabled={messages.length === 0}
                            className={`flex items-center space-x-2 px-4 py-2.5 ${darkMode ? 'bg-slate-700 border-slate-600 hover:bg-slate-600' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'} border rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium`}
                        >
                            <Download className={`w-4 h-4 ${textSecondary}`} />
                            <span className={`hidden sm:inline ${textPrimary}`}>Export</span>
                        </button>   

                        <button
                            onClick={clearMessages}
                            disabled={messages.length === 0}
                            className={`flex items-center space-x-2 px-4 py-2.5 ${darkMode ? 'bg-red-900/30 border-red-700 hover:bg-red-900/50 text-red-300' : 'bg-red-50 border-red-200 hover:bg-red-100 text-red-700'} border rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium`}
                        >
                            <Trash2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Clear</span>
                        </button>
                    </div>
                </div>

                {/* Global Map Modal */}
                {showAllMap && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className={`${cardBg} rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col transition-colors duration-200`}>
                            <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                                <div className="flex items-center space-x-3">
                                    <MapIcon className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                    <h2 className={`text-xl font-bold ${textPrimary}`}>All Locations Map</h2>
                                    <span className={`px-3 py-1 ${darkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'} rounded-full text-sm font-semibold`}>
                                        {filteredMessages.filter(m => m.gps).length} locations
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowAllMap(false)}
                                    className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'} transition-colors`}
                                >
                                    <X className={`w-5 h-5 ${textSecondary}`} />
                                </button>
                            </div>
                            <div id="global-map" className="flex-1 rounded-b-2xl"></div>
                        </div>
                    </div>
                )}

                {/* Messages Grid */}
                {isFetchingMessages && messages.length === 0 ? (
                    <div className={`${cardBg} rounded-xl shadow-sm border p-16 flex flex-col items-center justify-center transition-colors duration-200`}>
                        <div className="relative">
                            <div className={`w-16 h-16 border-4 ${darkMode ? 'border-slate-700 border-t-blue-500' : 'border-slate-200 border-t-blue-600'} rounded-full animate-spin`}></div>
                        </div>
                        <p className={`${textSecondary} font-medium mt-4`}>Connecting to network...</p>
                    </div>
                ) : filteredMessages.length === 0 ? (
                    <div className={`${cardBg} rounded-xl shadow-sm border p-16 flex flex-col items-center justify-center transition-colors duration-200`}>
                        <div className={`${darkMode ? 'bg-slate-700' : 'bg-slate-100'} p-6 rounded-2xl mb-4`}>
                            <MapPin className={`w-12 h-12 ${textSecondary}`} />
                        </div>
                        <p className={`${textPrimary} font-semibold text-lg`}>No messages found</p>
                        <p className={`${textSecondary} text-sm mt-1`}>
                            {searchTerm || filterType !== 'all' || urgencyFilter !== 'all' ? 'Try adjusting your filters' : 'Waiting for incoming data...'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        {filteredMessages.map((msg, index) => {
                            const msgId = `${msg.src}-${msg.msg_id}-${index}`;
                            
                            if (msg.gps) {
                                setTimeout(() => {
                                    if (!cardMapRefs.current[msgId]) {
                                        initCardMap(msgId, msg.gps.latitude, msg.gps.longitude, msg.urgency);
                                    }
                                }, 100);
                            }

                            return (
                                <div 
                                    key={msgId}
                                    className={`${cardBg} rounded-xl shadow-sm border overflow-hidden hover:shadow-lg transition-all duration-200`}
                                >
                                    <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                {msg.name && (
                                                    <h3 className={`text-lg font-bold ${textPrimary} mb-1`}>
                                                        {msg.name}
                                                    </h3>
                                                )}
                                                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'} leading-relaxed`}>
                                                    {msg.message}
                                                </p>
                                            </div>
                                            {msg.urgency && (
                                                <span className={`flex items-center space-x-1 px-3 py-1.5 text-xs font-bold rounded-lg border ml-3 ${getUrgencyStyles(msg.urgency)}`}>
                                                    {getUrgencyIcon(msg.urgency)}
                                                    <span>{msg.urgency}</span>
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="flex flex-wrap gap-2">
                                            <span className={`inline-flex items-center px-2.5 py-1 ${darkMode ? 'bg-blue-900/30 text-blue-300 border-blue-700' : 'bg-blue-50 text-blue-700 border-blue-200'} text-xs font-semibold rounded-md border`}>
                                                Node {msg.src} → {msg.cur}
                                            </span>
                                            <span className={`inline-flex items-center px-2.5 py-1 ${darkMode ? 'bg-purple-900/30 text-purple-300 border-purple-700' : 'bg-purple-50 text-purple-700 border-purple-200'} text-xs font-semibold rounded-md border`}>
                                                ID: {msg.msg_id}
                                            </span>
                                            {msg.gps && (
                                                <span className={`inline-flex items-center space-x-1 px-2.5 py-1 ${darkMode ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700' : 'bg-cyan-50 text-cyan-700 border-cyan-200'} text-xs font-semibold rounded-md border`}>
                                                    <MapPin className="w-3 h-3" />
                                                    <span>GPS</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {msg.gps && (
                                        <div className="relative">
                                            <div id={`map-${msgId}`} className="h-48 w-full"></div>
                                            <div className={`absolute bottom-3 left-3 right-3 ${darkMode ? 'bg-slate-900/90' : 'bg-white/90'} backdrop-blur-sm px-3 py-2 rounded-lg border ${darkMode ? 'border-slate-700' : 'border-slate-200'} shadow-lg`}>
                                                <p className={`text-xs font-mono ${textSecondary}`}>
                                                    {msg.gps.latitude.toFixed(6)}, {msg.gps.longitude.toFixed(6)}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className={`px-4 py-3 ${darkMode ? 'bg-slate-900/50' : 'bg-slate-50'} border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center space-x-2">
                                                <Clock className={`w-3.5 h-3.5 ${textSecondary}`} />
                                                <span className={`${textSecondary} font-medium`}>
                                                    {new Date().toLocaleTimeString()}
                                                </span>
                                            </div>
                                            {!msg.gps && (
                                                <span className={`px-2 py-1 ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'} rounded text-xs font-medium`}>
                                                    No GPS Data
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Footer Info */}
                <div className={`mt-6 ${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                    <div className="flex items-center justify-between text-sm flex-wrap gap-4">
                        <div className="flex items-center space-x-4 sm:space-x-6">
                            <div className="flex items-center space-x-2">
                                <Clock className={`w-4 h-4 ${textSecondary}`} />
                                <span className={`${textSecondary} font-medium text-xs sm:text-sm`}>Auto-refresh: 2s</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Radio className={`w-4 h-4 ${textSecondary}`} />
                                <span className={`${textSecondary} font-medium text-xs sm:text-sm`}>
                                    Total: <span className={`font-bold ${textPrimary}`}>{messages.length}</span>
                                </span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <MapPin className={`w-4 h-4 ${textSecondary}`} />
                                <span className={`${textSecondary} font-medium text-xs sm:text-sm`}>
                                    GPS: <span className={`font-bold ${textPrimary}`}>{stats.withGPS}</span>
                                </span>
                            </div>
                        </div>
                        <div className={`${textSecondary} text-xs font-mono`}>
                            Last update: {new Date().toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default LandingPage;