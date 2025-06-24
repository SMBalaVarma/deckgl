import React from 'react';

export const PinTooltip = ({ selectedPin, tooltipPos, isVisible }) => {
  if (!selectedPin || !tooltipPos || !isVisible) return null;
  
  return (
    <div className="tooltip tooltip-center-screen tooltip-visible tooltip-animate">
      <strong>{selectedPin.name}</strong>
      <a href='#' target='_blank' rel="noopener noreferrer">
        Discover
      </a>
    </div>
  );
};
