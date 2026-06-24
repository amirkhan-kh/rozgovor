import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
}

const sizeMap: Record<string, string> = {
  sm: "w-5 h-5",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = "md" }) => {
  return (
    <div className="flex items-center justify-center">
      <div
        className={`${sizeMap[size]} border-2 border-accent/20 border-t-accent rounded-full animate-spin`}
      />
    </div>
  );
};

export default LoadingSpinner;
