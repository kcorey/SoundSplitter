#!/usr/bin/env python3
"""
Face comparison script using OpenCV for applause detection.
Uses OpenCV's face detection and simple image comparison.
"""

import sys
import cv2
import numpy as np
import json
from PIL import Image

def compare_faces(image1_path, image2_path):
    """
    Compare faces in two images using OpenCV.
    Returns similarity score and whether faces are different.
    """
    try:
        # Load images
        image1 = cv2.imread(image1_path)
        image2 = cv2.imread(image2_path)
        
        if image1 is None or image2 is None:
            print("Failed to load images")
            return {"similarity": 0.3, "person_change": bool(True), "confidence": 0.3, "error": "Failed to load images"}
        
        # Convert to grayscale for face detection
        gray1 = cv2.cvtColor(image1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(image2, cv2.COLOR_BGR2GRAY)
        
        # Load face cascade classifier
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        
        # Detect faces
        faces1 = face_cascade.detectMultiScale(gray1, 1.1, 4)
        faces2 = face_cascade.detectMultiScale(gray2, 1.1, 4)
        
        print(f"Found {len(faces1)} faces in image1, {len(faces2)} faces in image2")
        
        # If no faces found in either image, use basic image comparison
        if len(faces1) == 0 or len(faces2) == 0:
            print("No faces detected, using basic image comparison")
            similarity = basic_image_comparison(image1, image2)
            person_change = similarity < 0.7
            return {"similarity": float(similarity), "person_change": bool(person_change), "confidence": float(similarity)}
        
        # Get the largest face from each image
        largest_face1 = get_largest_face(faces1)
        largest_face2 = get_largest_face(faces2)
        
        # Extract face regions
        face1_region = extract_face_region(image1, largest_face1)
        face2_region = extract_face_region(image2, largest_face2)
        
        # Compare face regions
        similarity = compare_face_regions(face1_region, face2_region)
        
        # Determine person change (lower similarity = different person)
        person_change = similarity < 0.6
        
        print(f"Face similarity: {similarity:.3f}")
        print(f"Person change: {person_change}")
        
        return {
            "similarity": float(similarity),
            "person_change": bool(person_change),
            "confidence": float(similarity)
        }
        
    except Exception as e:
        print(f"Error in face comparison: {e}")
        return {"similarity": 0.5, "person_change": bool(False), "confidence": 0.5, "error": str(e)}

def get_largest_face(faces):
    """Get the largest face from a list of detected faces."""
    if len(faces) == 0:
        return None
    
    largest_area = 0
    largest_face = None
    
    for (x, y, w, h) in faces:
        area = w * h
        if area > largest_area:
            largest_area = area
            largest_face = (x, y, w, h)
    
    return largest_face

def extract_face_region(image, face):
    """Extract face region from image."""
    if face is None:
        return None
    
    x, y, w, h = face
    face_region = image[y:y+h, x:x+w]
    
    # Resize to standard size for comparison
    face_region = cv2.resize(face_region, (100, 100))
    
    return face_region

def compare_face_regions(face1, face2):
    """Compare two face regions using multiple methods."""
    if face1 is None or face2 is None:
        return 0.3
    
    # Method 1: Histogram comparison
    hist1 = cv2.calcHist([face1], [0], None, [256], [0, 256])
    hist2 = cv2.calcHist([face2], [0], None, [256], [0, 256])
    
    # Normalize histograms
    cv2.normalize(hist1, hist1, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(hist2, hist2, 0, 1, cv2.NORM_MINMAX)
    
    # Compare histograms using correlation
    hist_similarity = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
    
    # Method 2: Mean absolute difference
    diff = cv2.absdiff(face1, face2)
    mean_diff = np.mean(diff)
    pixel_similarity = 1.0 - (mean_diff / 255.0)
    
    # Combine similarities
    combined_similarity = (hist_similarity * 0.6) + (pixel_similarity * 0.4)
    
    return max(0.0, min(1.0, combined_similarity))

def basic_image_comparison(image1, image2):
    """Basic image comparison when no faces are detected."""
    # Resize images to same size
    image1_resized = cv2.resize(image1, (100, 100))
    image2_resized = cv2.resize(image2, (100, 100))
    
    # Convert to grayscale
    gray1 = cv2.cvtColor(image1_resized, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(image2_resized, cv2.COLOR_BGR2GRAY)
    
    # Calculate mean absolute difference
    diff = cv2.absdiff(gray1, gray2)
    mean_diff = np.mean(diff)
    
    # Convert to similarity
    similarity = 1.0 - (mean_diff / 255.0)
    
    return max(0.0, min(1.0, similarity))

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python face_recognition_compare.py <image1> <image2>")
        sys.exit(1)
    
    image1_path = sys.argv[1]
    image2_path = sys.argv[2]
    
    result = compare_faces(image1_path, image2_path)
    print(json.dumps(result)) 