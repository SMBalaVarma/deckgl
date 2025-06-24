import React, { useState, useEffect, useRef } from 'react';
import DeckGL from 'deck.gl';
import { FlyToInterpolator } from '@deck.gl/core';
import { isMobile } from 'react-device-detect';
import Map from 'react-map-gl/mapbox';
import { MapInteractions } from './MapInteractions';
import { MapLayers } from './MapLayers';
import { ControlPanel } from './ControlPanel';
import { PinTooltip } from './PinTooltip';
import NationalParksData from '../data.json';

const MAPBOX_TOKEN = 'pk.eyJ1IjoieGNoYW1wcyIsImEiOiJjbThlY3BzbWgwMDVrMmlzNWF0Z3BpNGpzIn0.SeVutB4KYQcAvRvoQC3DCg';
const MapStyle = 'mapbox://styles/mapbox/satellite-v9';

const CENTER_POINT = {
  latitude: 33.6095571,
  longitude: -84.8039517
};
const MAX_RADIUS = 0.03;

const INITIAL_VIEW_STATE = {
  latitude: CENTER_POINT.latitude,
  longitude: CENTER_POINT.longitude,
  zoom: 3,
  pitch: 60,
  bearing: -30,
  maxZoom: 20,
  minZoom: 1
};

export const MapContainer = () => {
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [hoverInfo, setHoverInfo] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const deckRef = useRef();
  const [selectedId, setSelectedId] = useState(null);
  const pendingIdRef = useRef(null);
  const [isInWheelMode, setIsInWheelMode] = useState(false);
  const wheelModeProgressRef = useRef(0);
  const wheelModeTargetProgressRef = useRef(0);
  const isAnimationLockedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const loadingTimeoutRef = useRef();
  const [isDragging, setIsDragging] = useState(false);
  const [isPinTransition, setIsPinTransition] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);
  const targetViewRef = useRef({ pitch: INITIAL_VIEW_STATE.pitch, bearing: INITIAL_VIEW_STATE.bearing });
  const animationFrameRef = useRef();
  const prevViewStateRef = useRef(null);
  const leftDragVelocityRef = useRef({ bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 });
  const [ambientMovementEnabled, setAmbientMovementEnabled] = useState(true);
  const targetPositionRef = useRef({
    latitude: INITIAL_VIEW_STATE.latitude,
    longitude: INITIAL_VIEW_STATE.longitude,
    zoom: INITIAL_VIEW_STATE.zoom
  });
  const baseZoomRef = useRef(INITIAL_VIEW_STATE.zoom);
  const tempZoomOffsetRef = useRef(0);
  const isInertiaActiveRef = useRef(false);
  const canvasRef = useRef();
  const wrapperRef = useRef();
  const shouldStayAtPinPositionRef = useRef(false);
  const [isAtSmoothDragZoom, setIsAtSmoothDragZoom] = useState(false);
  const isManualZoomRef = useRef(false);
  const SMOOTH_DRAG_ZOOM_LEVEL = 16;

  const isZoomDraggingRef = useRef(false);
const floatingVelocityRef = useRef({ x: 0, y: 0 });
const isDraggingRef = useRef(false);
const isTouchDraggingRef = useRef(false);

  const [smoothnessSettings, setSmoothnessSettings] = useState({
    floatingStrength: 0.03,
    floatingDamping: 0.98,
    floatingMaxInfluence: 15,
    mouseVelocityInfluence: 0.01,
    rotationSpeedMinZoom: 13.5,
    rotationSpeedMaxZoom: 16,
    rotationSpeedAtMinZoom: isMobile ? 0.09 : 0.08,
    rotationSpeedAtMaxZoom: isMobile ? 0.15 : 0.12,
    leftDampingFactor: isMobile ? 0.90 : 0.95,
    leftDragBearingSensitivity: isMobile ? 0.15 : 0.10,
    leftSmoothFactor: 0.15,
    dragLerpFactor: 0.15,
    verticalZoomSensitivity: 0.001,
    zoomFloatRange: 1,
    zoomReturnSpeed: 0.1,
    zoomReturnDamping: 0.85,
    zoomReturnCurve: 2.0,
    zoomDamping: 0.88,
    minZoom: 11,
    maxZoom: 16,
    ambientStrength: 0.5,
    ambientMaxPitch: 1.5,
    ambientMaxBearing: 2.5,
    ambientSmoothness: 0.92,
    ambientMaxPitchOffset: 0.0005,
    ambientMaxBearingOffset: 0.0010,
    ambientMaxLatOffset: 0.0001,
    ambientMaxLngOffset: 0.0001,
    forwardSpeedMinZoom: 13.5,
    forwardSpeedMaxZoom: 16,
    forwardSpeedAtMinZoom: isMobile ? 0.01 : 0.012,
    forwardSpeedAtMaxZoom: isMobile ? 0.026 : 0.035,
    forwardMovementSpeed: isMobile ? 0.05 : 0.04,
    forwardMovementDamping: 0.94,
    globalSmoothness: 0.85,
    stopThreshold: 0.001,
    boundaryBounceFactor: 0.3,
    boundaryResistance: 0.8,
    dynamicPitchEnabled: true,
    minPitchValue: 60,
    maxPitchValue: 60,
    pitchZoomThresholdLow: 11,
    pitchZoomThresholdHigh: 15,
  });

  const clampToRadius = (lat, lng) => {
    const latDiff = lat - CENTER_POINT.latitude;
    const lngDiff = (lng - CENTER_POINT.longitude) * Math.cos(CENTER_POINT.latitude * Math.PI / 180);
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

    if (distance <= MAX_RADIUS) {
      return {
        latitude: lat,
        longitude: lng,
        isAtBoundary: false
      };
    }

    const angle = Math.atan2(lngDiff, latDiff);
    return {
      latitude: CENTER_POINT.latitude + MAX_RADIUS * Math.cos(angle),
      longitude: CENTER_POINT.longitude + (MAX_RADIUS * Math.sin(angle)) / Math.cos(CENTER_POINT.latitude * Math.PI / 180),
      isAtBoundary: true
    };
  };

  const smoothInterpolate = (current, target, factor, momentum = 0) => {
    const diff = target - current;
    const newValue = current + diff * factor + momentum;
    return newValue;
  };

  const playInitialZoom = (duration) => {
    const finalDuration = duration ?? 3000;
    isAnimationLockedRef.current = true;
    setSelectedId(null);
    setHoverInfo(null);
    setSelectedPin(null);
    shouldStayAtPinPositionRef.current = false;

    baseZoomRef.current = SMOOTH_DRAG_ZOOM_LEVEL;
    tempZoomOffsetRef.current = 0;
    isZoomDraggingRef.current = false;
    setIsAtSmoothDragZoom(true);

    targetPositionRef.current = {
      latitude: CENTER_POINT.latitude,
      longitude: CENTER_POINT.longitude,
      zoom: SMOOTH_DRAG_ZOOM_LEVEL
    };
    targetViewRef.current = {
      pitch: 60,
      bearing: INITIAL_VIEW_STATE.bearing
    };
    leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
    floatingVelocityRef.current = { x: 0, y: 0 };

    setViewState(prev => ({
      ...prev,
      longitude: CENTER_POINT.longitude,
      latitude: CENTER_POINT.latitude,
      zoom: SMOOTH_DRAG_ZOOM_LEVEL,
      pitch: 60,
      bearing: -20,
      transitionDuration: finalDuration,
      transitionInterpolator: new FlyToInterpolator(),
      onTransitionEnd: () => {
        setIsPinTransition(false);
        isAnimationLockedRef.current = false;
      }
    }));
  };

  // Tooltip positioning effect
  useEffect(() => {
    if (selectedPin && deckRef.current && deckRef.current.deck) {
      const updateTooltipPosition = () => {
        const viewports = deckRef.current.deck.getViewports();
        if (viewports && viewports.length > 0) {
          const viewport = viewports[0];
          const [x, y] = viewport.project([selectedPin.longitude, selectedPin.latitude]);
          setTooltipPos({ x, y });
        }
      };

      updateTooltipPosition();

      const deckCanvas = deckRef.current.deck.canvas;
      deckCanvas.addEventListener('deck.gl.viewState', updateTooltipPosition);

      return () => {
        deckCanvas.removeEventListener('deck.gl.viewState', updateTooltipPosition);
      };
    } else {
      setTooltipPos(null);
    }
  }, [selectedPin, viewState]);

  // Map loaded effect
  useEffect(() => {
    setViewState(INITIAL_VIEW_STATE);
  }, []);

  useEffect(() => {
    if (isMapLoaded) {
      const animationTimeout = setTimeout(() => {
        playInitialZoom();
      }, 300);
      
      return () => clearTimeout(animationTimeout);
    }
  }, [isMapLoaded]);

  // Browser zoom prevention
  useEffect(() => {
    const preventBrowserZoom = (e) => {
      if (e.ctrlKey && (e.type === 'wheel' || e.type === 'mousewheel')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    document.addEventListener('wheel', preventBrowserZoom, { passive: false });
    document.addEventListener('keydown', preventBrowserZoom, { passive: false });
    document.addEventListener('mousewheel', preventBrowserZoom, { passive: false });

    return () => {
      document.removeEventListener('wheel', preventBrowserZoom);
      document.removeEventListener('keydown', preventBrowserZoom);
      document.removeEventListener('mousewheel', preventBrowserZoom);
    };
  }, []);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Viewport meta tag effect
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.getElementsByTagName('head')[0].appendChild(meta);
    }
  }, []);

  const handlePinClick = (info) => {
    if (info.object) {
      isAnimationLockedRef.current = true;

      setIsInWheelMode(false);
      wheelModeProgressRef.current = 0;
      wheelModeTargetProgressRef.current = 0;
      
      isZoomDraggingRef.current = false;
      tempZoomOffsetRef.current = 0;
      
      setIsPinTransition(true);
      const objectCoords = info.object.geometry.coordinates;
      if (!objectCoords || objectCoords.length < 2) {
        console.error("Invalid coordinates for pin:", info.object);
        return;
      }

      const [longitude, latitude] = (Array.isArray(objectCoords[0]) && typeof objectCoords[0][0] === 'number')
        ? objectCoords[0]
        : objectCoords;

      const clickedId = info.object.id;
      pendingIdRef.current = clickedId;

      setSelectedPin({
        name: info.object.properties.Name,
        longitude,
        latitude
      });

      setIsLoading(true);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }

      setHoverInfo({
        name: info.object.properties.Name,
        longitude,
        latitude
      });

      shouldStayAtPinPositionRef.current = true;
      setIsPinTransition(true);
      leftDragVelocityRef.current = { bearing: 0, pitch: 0, latitude: 0, longitude: 0, zoom: 0 };
      floatingVelocityRef.current = { x: 0, y: 0 };
      const pinTargetZoom = 16;
      const pinTargetPitch = 60;
      const pinTargetBearing = -20;
      targetPositionRef.current = {
        latitude: latitude,
        longitude: longitude,
        zoom: pinTargetZoom
      };
      targetViewRef.current = {
        pitch: pinTargetPitch,
        bearing: pinTargetBearing
      };

      setViewState(prev => ({
        ...prev,
        longitude,
        latitude,
        zoom: pinTargetZoom,
        pitch: pinTargetPitch,
        bearing: pinTargetBearing,
        transitionDuration: 2000,
        transitionInterpolator: new FlyToInterpolator(),
        onTransitionEnd: () => {
          setSelectedId(pendingIdRef.current);
          shouldStayAtPinPositionRef.current = true;
          targetPositionRef.current = {
            latitude: latitude,
            longitude: longitude,
            zoom: pinTargetZoom
          };
          targetViewRef.current = {
            pitch: pinTargetPitch,
            bearing: pinTargetBearing
          };
          baseZoomRef.current = pinTargetZoom;

          loadingTimeoutRef.current = setTimeout(() => {
            setIsLoading(false);
            setIsPinTransition(false);
            isAnimationLockedRef.current = false;
          }, 500);
        }
      }));
    }
  };

  const handleMapClick = (info) => {
    if (isAnimationLockedRef.current) {
      return;
    }

    if (!info.object) {
      setHoverInfo(null);
      setSelectedId(null);
      setSelectedPin(null);
      shouldStayAtPinPositionRef.current = false;
    }
  };

  const layers = MapLayers({ 
    selectedId, 
    onPinClick: handlePinClick, 
    nationalParksData: NationalParksData.features,
    CENTER_POINT,
    MAX_RADIUS
  });

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        backgroundColor: '#1a1a2e'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh',
          zIndex: -1, pointerEvents: 'none'
        }}
      />

      <DeckGL
        ref={deckRef}
        viewState={viewState}
        controller={{
          dragPan: false, dragRotate: false, scrollZoom: false, touchZoom: false,
          touchRotate: false, doubleClickZoom: true, keyboard: false, inertia: false
        }}
        layers={layers}
        width="100%"
        height="100%"
        style={{ position: 'absolute', left: 0, top: 0 }}
        parameters={{
          clearColor: [0.05, 0.05, 0.05, 1.0]
        }}
        onViewStateChange={({ viewState: newDeckViewState, interactionState }) => {
          setViewState(newDeckViewState);
          
          if (isPinTransition) {
            return; 
          }
          
          if (!interactionState.inTransition && 
              !isDraggingRef.current && 
              !isTouchDraggingRef.current && 
              !isInWheelMode) {
            
            setTimeout(() => {
              if (!isInertiaActiveRef.current) {
                targetPositionRef.current = {
                  latitude: newDeckViewState.latitude,
                  longitude: newDeckViewState.longitude,
                  zoom: newDeckViewState.zoom
                };
                targetViewRef.current = {
                  pitch: newDeckViewState.pitch,
                  bearing: newDeckViewState.bearing,
                };
                baseZoomRef.current = newDeckViewState.zoom;
              }
            }, 16);
          }
          
          if (isInWheelMode && !isDraggingRef.current && !isTouchDraggingRef.current) {
            targetPositionRef.current.latitude = newDeckViewState.latitude;
            targetPositionRef.current.longitude = newDeckViewState.longitude;
          }
        }}
        onClick={handleMapClick}
        pickingRadius={30}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MapStyle}
          width="100%"
          height="100%"
          onLoad={() => {
            setIsLoading(false);
            setIsMapLoaded(true);
          }}
        />
      </DeckGL>

      <MapInteractions
        viewState={viewState}
        setViewState={setViewState}
        smoothnessSettings={smoothnessSettings}
        ambientMovementEnabled={ambientMovementEnabled}
        isInWheelMode={isInWheelMode}
        setIsInWheelMode={setIsInWheelMode}
        wheelModeProgressRef={wheelModeProgressRef}
        wheelModeTargetProgressRef={wheelModeTargetProgressRef}
        isPinTransition={isPinTransition}
        targetViewRef={targetViewRef}
        animationFrameRef={animationFrameRef}
        prevViewStateRef={prevViewStateRef}
        leftDragVelocityRef={leftDragVelocityRef}
        targetPositionRef={targetPositionRef}
        baseZoomRef={baseZoomRef}
        tempZoomOffsetRef={tempZoomOffsetRef}
        isInertiaActiveRef={isInertiaActiveRef}
        wrapperRef={wrapperRef}
        shouldStayAtPinPositionRef={shouldStayAtPinPositionRef}
        isAnimationLockedRef={isAnimationLockedRef}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        setSelectedPin={setSelectedPin}
        setHoverInfo={setHoverInfo}
        hoverInfo={hoverInfo}
        selectedPin={selectedPin}
        clampToRadius={clampToRadius}
        smoothInterpolate={smoothInterpolate}
        CENTER_POINT={CENTER_POINT}
        MAX_RADIUS={MAX_RADIUS}
        SMOOTH_DRAG_ZOOM_LEVEL={SMOOTH_DRAG_ZOOM_LEVEL}
        isManualZoomRef={isManualZoomRef}
      />

      <ControlPanel
        smoothnessSettings={smoothnessSettings}
        setSmoothnessSettings={setSmoothnessSettings}
        viewState={viewState}
        setViewState={setViewState}
        ambientMovementEnabled={ambientMovementEnabled}
        setAmbientMovementEnabled={setAmbientMovementEnabled}
        targetViewRef={targetViewRef}
        targetPositionRef={targetPositionRef}
        baseZoomRef={baseZoomRef}
        isManualZoomRef={isManualZoomRef}
        onRevert={() => {
          setIsInWheelMode(false);
          wheelModeProgressRef.current = 0;
          wheelModeTargetProgressRef.current = 0;
          setIsPinTransition(true);
          playInitialZoom(1500);
        }}
      />

      <PinTooltip
        selectedPin={selectedPin}
        tooltipPos={tooltipPos}
        isVisible={selectedPin && tooltipPos}
      />

      <style>{`
        body, html { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; position: fixed; }
        #root { width: 100%; height: 100%; overflow: hidden; position: fixed; }
        .live-back-btns { position: absolute; top: 20px; right: 20px; z-index: 9999; }
        .live-back-btns ul { display: flex; gap: 25px; margin: 0; padding: 0; list-style: none; }
        .smoothness-controls::-webkit-scrollbar { width: 6px; }
        .smoothness-controls::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); border-radius: 3px; }
        .smoothness-controls::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; }
        .smoothness-controls::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
        .tooltip { background: rgba(0,0,0, 0.3); padding: 25px 35px; border-radius: 12px; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4); opacity: 0; transition: opacity 0.3s ease-out, transform 0.3s ease-out; z-index: 1001; text-align: center; color: white; }
        .tooltip-center-screen { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.95); width: 70vw; min-height: 150px; display: flex; flex-direction: column; justify-content: center; align-items: center; }
        .tooltip strong { font-size: 72px; line-height: 78px; display: block; margin-bottom: 15px; } 
        .tooltip a { font-size: 18px; line-height: 22px; color: gold; text-decoration: none; padding: 8px 15px; border: 0.5px solid gold; border-radius: 5px; transition: background-color 0.2s, color 0.2s; } 
        .tooltip a:hover { background-color: gold; color: black; }
        .tooltip-visible { opacity: 1; } 
        .tooltip-animate { animation: fadeInUpTooltipCentered 0.4s ease-out forwards; }
        @keyframes fadeInUpTooltipCentered { 0% { opacity: 0; transform: translate(-50%, -45%) scale(0.95); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @media only screen and (max-width: 992px) { .tooltip-center-screen { width: 70vw; padding: 20px; } .tooltip strong { font-size: 46px; line-height: 60px; margin-bottom: 10px;} .tooltip a { font-size: 16px; line-height: 20px; } }
        @media only screen and (max-width: 767px) { .tooltip-center-screen { width: 80vw; max-width: 280px; padding: 15px; } .tooltip strong { font-size: 32px; line-height: 46px; margin-bottom: 8px;} .tooltip a { font-size: 14px; line-height: 18px; } }
      `}</style>
    </div>
  );
};

export default MapContainer;
