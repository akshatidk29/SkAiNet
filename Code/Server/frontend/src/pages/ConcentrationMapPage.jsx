import React, { useState, useEffect, useRef } from 'react';
import { MapPin, AlertTriangle, Info, CheckCircle, Layers } from 'lucide-react';
import { useMessageStore } from '../store/useMessageStore';

const ConcentrationMapPage = () => {
    const { messages, fetchMessages } = useMessageStore();
    const [allData, setAllData] = useState([]);
    const [darkMode, setDarkMode] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(13);
    const [isInitialized, setIsInitialized] = useState(false);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const clusterMarkersRef = useRef([]);

    // Sync dark mode with navbar
    useEffect(() => {
        const savedMode = document.documentElement.classList.contains('dark');
        setDarkMode(savedMode);

        const observer = new MutationObserver(() => {
            const isDark = document.documentElement.classList.contains('dark');
            setDarkMode(isDark);
        });

        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    // Fetch messages from store on mount and set up polling
    useEffect(() => {
        fetchMessages();
        const interval = setInterval(() => {
            fetchMessages();
        }, 2000);
        return () => clearInterval(interval);
    }, [fetchMessages]);

    // Load dummy data from JSON files and merge with live data
    useEffect(() => {
        const loadDummyData = async () => {
            const dummyData = [];
            const files = [
                '/Data/disaster_logs_high_urgency.json',
                '/Data/disaster_logs_medium_urgency.json',
                '/Data/disaster_logs_low_urgency.json'
            ];

            for (const file of files) {
                try {
                    const response = await fetch(file);
                    if (response.ok) {
                        const data = await response.json();
                        const logs = data.logs || [];
                        logs.forEach(log => {
                            if (log.gps && log.gps.latitude && log.gps.longitude) {
                                dummyData.push({
                                    src: String(log.source_node || '1'),
                                    cur: String(log.current_node || '1'),
                                    msg_id: String(log.message_id || '0000'),
                                    name: log.sender_name || 'Unknown',
                                    message: log.message || '',
                                    gps: {
                                        latitude: parseFloat(log.gps.latitude),
                                        longitude: parseFloat(log.gps.longitude)
                                    },
                                    urgency: log.urgency || 'NONE'
                                });
                            }
                        });
                    }
                } catch (error) {
                    console.log(`Could not load ${file}:`, error);
                }
            }

            // Filter live messages that have GPS data
            const liveDataWithGPS = messages
                .filter(m => m.gps && m.gps.latitude && m.gps.longitude)
                .map(m => ({
                    ...m,
                    src: String(m.src || ''),
                    cur: String(m.cur || ''),
                    msg_id: String(m.msg_id || ''),
                    name: m.name || 'Unknown',
                    message: m.message || '',
                    gps: {
                        latitude: parseFloat(m.gps.latitude),
                        longitude: parseFloat(m.gps.longitude)
                    },
                    urgency: m.urgency || 'NONE'
                }));

            // Merge dummy data with live messages
            const combined = [...dummyData, ...liveDataWithGPS];

            // Remove duplicates based on src and msg_id
            const unique = combined.filter((item, index, self) =>
                index === self.findIndex((t) =>
                    t.src === item.src && t.msg_id === item.msg_id
                )
            );

            console.log(`Total data points: ${unique.length} (Dummy: ${dummyData.length}, Live: ${liveDataWithGPS.length})`);
            setAllData(unique);
        };

        loadDummyData();
    }, [messages]);

    // Initialize map
    useEffect(() => {
        const L = window.L;
        if (!L) {
            console.error('Leaflet not loaded');
            return;
        }

        if (!mapRef.current && !isInitialized) {
            initMap();
            setIsInitialized(true);
        }
    }, [isInitialized]);

    // Update map when data or zoom changes
    useEffect(() => {
        if (mapRef.current && allData.length > 0) {
            updateMap();
        }
    }, [allData, currentZoom]);

    const initMap = () => {
        const L = window.L;
        if (!L) return;

        try {
            const map = L.map('concentration-map').setView([31.78, 77.00], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);

            map.on('zoomend', () => {
                const newZoom = map.getZoom();
                console.log('Zoom changed to:', newZoom);
                setCurrentZoom(newZoom);
            });

            mapRef.current = map;
            console.log('Map initialized successfully');
        } catch (error) {
            console.error('Error initializing map:', error);
        }
    };

    const calculateClusters = (points, zoom) => {
        // At low zoom levels, cluster points that are close together
            let clusterDistance;
    if (zoom < 10) {
        clusterDistance = 0.1;  // ~11km - very aggressive clustering
    } else if (zoom < 12) {
        clusterDistance = 0.03; // ~3.3km
    } else if (zoom < 14) {
        clusterDistance = 0.005; // ~550m - much smaller!
    } else if (zoom < 16) {
        clusterDistance = 0.002; // ~220m - very small
    } else {
        clusterDistance = 0.0005; // ~55m - essentially no clustering
    }
        const clusters = [];
        const processed = new Set();

        points.forEach((point, idx) => {
            if (processed.has(idx)) return;

            const cluster = {
                center: { lat: point.gps.latitude, lon: point.gps.longitude },
                points: [point],
                urgencyCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 }
            };

            cluster.urgencyCounts[point.urgency || 'NONE']++;
            processed.add(idx);

            // Find nearby points
            points.forEach((otherPoint, otherIdx) => {
                if (processed.has(otherIdx)) return;

                const distance = Math.sqrt(
                    Math.pow(point.gps.latitude - otherPoint.gps.latitude, 2) +
                    Math.pow(point.gps.longitude - otherPoint.gps.longitude, 2)
                );

                if (distance < clusterDistance) {
                    cluster.points.push(otherPoint);
                    cluster.urgencyCounts[otherPoint.urgency || 'NONE']++;
                    processed.add(otherIdx);
                }
            });

            // Calculate weighted center
            let latSum = 0, lonSum = 0;
            cluster.points.forEach(p => {
                latSum += p.gps.latitude;
                lonSum += p.gps.longitude;
            });
            cluster.center.lat = latSum / cluster.points.length;
            cluster.center.lon = lonSum / cluster.points.length;

            clusters.push(cluster);
        });

        return clusters;
    };

    const getMajorityThreatColor = (urgencyCounts) => {
        const high = urgencyCounts.HIGH || 0;
        const medium = urgencyCounts.MEDIUM || 0;
        const low = urgencyCounts.LOW || 0;
        const none = urgencyCounts.NONE || 0;

        // Find the maximum count
        const max = Math.max(high, medium, low, none);

        // Return color based on majority, with priority given to higher threats in case of ties
        if (high === max && high > 0) {
            return { color: '#ef4444', text: 'Critical' };
        } else if (medium === max && medium > 0) {
            return { color: '#f59e0b', text: 'Warning' };
        } else if (low === max && low > 0) {
            return { color: '#10b981', text: 'Low' };
        } else {
            return { color: '#3b82f6', text: 'Info' };
        }
    };

    const updateMap = () => {
        console.log('Raw allData:', allData.length);
        console.log('Valid coordinates count:', allData.filter(msg =>
            msg.gps &&
            msg.gps.latitude &&
            msg.gps.longitude &&
            !isNaN(msg.gps.latitude) &&
            !isNaN(msg.gps.longitude)
        ).length);
        const L = window.L;
        if (!L || !mapRef.current) return;

        // Clear existing markers
        markersRef.current.forEach(marker => {
            try {
                mapRef.current.removeLayer(marker);
            } catch (e) {
                console.log('Error removing marker:', e);
            }
        });
        clusterMarkersRef.current.forEach(marker => {
            try {
                mapRef.current.removeLayer(marker);
            } catch (e) {
                console.log('Error removing cluster:', e);
            }
        });
        markersRef.current = [];
        clusterMarkersRef.current = [];

        const zoom = mapRef.current.getZoom();
        console.log(`Updating map at zoom ${zoom} with ${allData.length} data points`);

        if (zoom >= 14) {
            // Show individual markers at high zoom
            let markerCount = 0;
            allData.forEach((msg, index) => {
                try {
                    const { latitude, longitude } = msg.gps;

                    // Validate coordinates
                    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
                        console.warn(`Invalid coordinates for message ${index}:`, msg);
                        return;
                    }

                    let iconColor = '#3b82f6';
                    if (msg.urgency === 'HIGH') iconColor = '#ef4444';
                    else if (msg.urgency === 'MEDIUM') iconColor = '#f59e0b';
                    else if (msg.urgency === 'LOW') iconColor = '#10b981';

                    const customIcon = L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background-color: ${iconColor}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });

                    const marker = L.marker([latitude, longitude], { icon: customIcon })
                        .bindPopup(`
                            <div style="min-width: 200px; font-family: system-ui;">
                                <div style="margin-bottom: 8px;">
                                    <strong style="font-size: 14px;">${msg.name || 'Unknown'}</strong>
                                    ${msg.urgency ? `<span style="background: ${iconColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 6px;">${msg.urgency}</span>` : ''}
                                </div>
                                <p style="margin: 6px 0; font-size: 12px; color: #666;">${msg.message || 'No message'}</p>
                                <div style="margin-top: 8px; font-size: 11px; color: #999;">
                                    Node ${msg.src} → ${msg.cur} | ID: ${msg.msg_id}
                                </div>
                                <div style="margin-top: 4px; font-size: 10px; color: #aaa;">
                                    ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
                                </div>
                            </div>
                        `)
                        .addTo(mapRef.current);

                    markersRef.current.push(marker);
                    markerCount++;
                } catch (error) {
                    console.error(`Error creating marker for index ${index}:`, error, msg);
                }
            });
            console.log(`Created ${markerCount} individual markers`);
        } else {
            // Show clusters at low zoom
            const clusters = calculateClusters(allData, zoom);
            console.log(`Created ${clusters.length} clusters`);

            clusters.forEach((cluster, clusterIndex) => {
                try {
                    const size = Math.min(60, 20 + cluster.points.length * 2);
                    const highPriority = cluster.urgencyCounts.HIGH || 0;
                    const mediumPriority = cluster.urgencyCounts.MEDIUM || 0;
                    const lowPriority = cluster.urgencyCounts.LOW || 0;

                    // Get majority threat color
                    const { color: clusterColor, text: priorityText } = getMajorityThreatColor(cluster.urgencyCounts);

                    const clusterIcon = L.divIcon({
                        className: 'cluster-marker',
                        html: `
                            <div style="
                                background-color: ${clusterColor};
                                width: ${size}px;
                                height: ${size}px;
                                border-radius: 50%;
                                border: 4px solid white;
                                box-shadow: 0 4px 16px rgba(0,0,0,0.4);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-weight: bold;
                                color: white;
                                font-size: ${Math.max(12, size / 4)}px;
                            ">
                                ${cluster.points.length}
                            </div>
                        `,
                        iconSize: [size, size],
                        iconAnchor: [size / 2, size / 2]
                    });

                    const marker = L.marker([cluster.center.lat, cluster.center.lon], { icon: clusterIcon })
                        .bindPopup(`
                            <div style="min-width: 250px; font-family: system-ui;">
                                <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
                                    <strong style="font-size: 16px; color: ${clusterColor};">${priorityText} Zone</strong>
                                    <div style="margin-top: 4px; font-size: 13px; color: #666;">
                                        ${cluster.points.length} incident${cluster.points.length > 1 ? 's' : ''} in this area
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px;">
                                    <div style="background: #fee2e2; padding: 8px; border-radius: 6px;">
                                        <div style="font-size: 20px; font-weight: bold; color: #ef4444;">${highPriority}</div>
                                        <div style="font-size: 11px; color: #991b1b;">High Priority</div>
                                    </div>
                                    <div style="background: #fef3c7; padding: 8px; border-radius: 6px;">
                                        <div style="font-size: 20px; font-weight: bold; color: #f59e0b;">${mediumPriority}</div>
                                        <div style="font-size: 11px; color: #92400e;">Medium</div>
                                    </div>
                                </div>
                                <div style="background: #f3f4f6; padding: 8px; border-radius: 6px; font-size: 12px; color: #6b7280;">
                                    <strong>Center:</strong> ${cluster.center.lat.toFixed(4)}, ${cluster.center.lon.toFixed(4)}
                                </div>
                                <div style="margin-top: 8px; font-size: 11px; color: #9ca3af; text-align: center;">
                                    Zoom in to see individual incidents
                                </div>
                            </div>
                        `)
                        .addTo(mapRef.current);

                    clusterMarkersRef.current.push(marker);
                } catch (error) {
                    console.error(`Error creating cluster ${clusterIndex}:`, error, cluster);
                }
            });
        }
    };

    const stats = {
        total: allData.length,
        high: allData.filter(m => m.urgency === 'HIGH').length,
        medium: allData.filter(m => m.urgency === 'MEDIUM').length,
        low: allData.filter(m => m.urgency === 'LOW').length,
        live: messages.filter(m => m.gps && m.gps.latitude && m.gps.longitude).length
    };

    const bgClass = darkMode ? 'bg-slate-900' : 'bg-slate-50';
    const cardBg = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
    const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
    const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-500';

    return (
        <div className={`min-h-screen ${bgClass} transition-colors duration-200`}>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                {/* Statistics */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
                    <div className={`${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs sm:text-sm ${textSecondary} font-medium`}>Total Points</p>
                                <p className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'} mt-1`}>{stats.total}</p>
                            </div>
                            <MapPin className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                        </div>
                    </div>

                    <div className={`${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs sm:text-sm ${textSecondary} font-medium`}>High</p>
                                <p className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-red-400' : 'text-red-600'} mt-1`}>{stats.high}</p>
                            </div>
                            <AlertTriangle className={`w-6 h-6 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                        </div>
                    </div>

                    <div className={`${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs sm:text-sm ${textSecondary} font-medium`}>Medium</p>
                                <p className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-amber-400' : 'text-amber-600'} mt-1`}>{stats.medium}</p>
                            </div>
                            <Info className={`w-6 h-6 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                        </div>
                    </div>

                    <div className={`${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs sm:text-sm ${textSecondary} font-medium`}>Low</p>
                                <p className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'} mt-1`}>{stats.low}</p>
                            </div>
                            <CheckCircle className={`w-6 h-6 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                        </div>
                    </div>

                    <div className={`${cardBg} rounded-xl shadow-sm border p-4 transition-colors duration-200`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs sm:text-sm ${textSecondary} font-medium`}>Live</p>
                                <p className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'} mt-1`}>{stats.live}</p>
                            </div>
                            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                        </div>
                    </div>
                </div>

                {/* Info Banner */}
                <div className={`${darkMode ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-xl p-4 mb-6`}>
                    <div className="flex items-start space-x-3">
                        <Info className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'} mt-0.5`} />
                        <div>
                            <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-900'} font-semibold`}>Interactive Concentration Map</p>
                            <p className={`text-xs ${darkMode ? 'text-blue-400' : 'text-blue-700'} mt-1`}>
                                Zoom out to see concentrated areas with colored clusters (red = high threat, yellow = medium, green = low). Zoom in (level 14+) to reveal individual incident markers. The map automatically updates with live data every 2 seconds.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Map Container */}
                <div className={`${cardBg} rounded-xl shadow-lg border overflow-hidden transition-colors duration-200`}>
                    <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <Layers className={`w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`} />
                                <div>
                                    <h2 className={`text-lg font-bold ${textPrimary}`}>Live Concentration View</h2>
                                    <p className={`text-xs ${textSecondary}`}>
                                        Zoom: {currentZoom} |
                                        Markers: {currentZoom >= 14 ? markersRef.current.length : clusterMarkersRef.current.length}
                                    </p>
                                </div>
                            </div>
                            <div className={`px-3 py-1.5 ${darkMode ? 'bg-slate-700' : 'bg-slate-100'} rounded-lg`}>
                                <span className={`text-sm font-semibold ${textPrimary}`}>
                                    {currentZoom >= 14 ? 'Individual View' : 'Cluster View'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div id="concentration-map" className="w-full" style={{ height: 'calc(100vh - 400px)', minHeight: '500px' }}></div>
                </div>
            </main>
        </div>
    );
};

export default ConcentrationMapPage;