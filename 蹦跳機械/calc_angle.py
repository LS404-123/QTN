
import math

# Constants
x0 = 150
y0 = 285
R = 69
L_pivot_x = 700
L_pivot_y = 430
H = 220

# We want to find phi such that the tangent from (x0, y0) with radius R 
# through the point P = (L_pivot_x - H*sin(phi), L_pivot_y + H*cos(phi))
# has a slope m = tan(phi).

# This simplifies to:
# (x0 - L_pivot_x) * sin(phi) - (y0 - L_pivot_y) * cos(phi) = R + H? 
# Wait, let's derive again.
# Vector from C to P: (xP - x0, yP - y0)
# Unit normal to tangent (which is parallel to leg): (cos(phi), sin(phi))
# Distance from C to line: |(xP - x0)*cos(phi) + (yP - y0)*sin(phi)| = R
# (L_pivot_x - H*sin(phi) - x0)*cos(phi) + (L_pivot_y + H*cos(phi) - y0)*sin(phi) = R
# (L_pivot_x - x0)*cos(phi) - H*sin(phi)*cos(phi) + (L_pivot_y - y0)*sin(phi) + H*cos(phi)*sin(phi) = R
# (L_pivot_x - x0)*cos(phi) + (L_pivot_y - y0)*sin(phi) = R
# 
# (700 - 150)*cos(phi) + (430 - 285)*sin(phi) = 69
# 550*cos(phi) + 145*sin(phi) = 69

A = 145
B = 550
C = 69

mag = math.sqrt(A*A + B*B)
alpha = math.atan2(B, A) # Angle of vector (A, B)

# sin(phi + alpha) = C/mag
sin_val = C / mag
phi_plus_alpha = math.asin(sin_val)
phi = phi_plus_alpha - alpha

# In degrees
phi_deg = math.degrees(phi)
print(f"Angle 1: {phi_deg}")

# Other solution: sin(phi + alpha) = pi - asin(C/mag)
phi_plus_alpha_2 = math.pi - phi_plus_alpha
phi_2 = phi_plus_alpha_2 - alpha
phi_deg_2 = math.degrees(phi_2)
print(f"Angle 2: {phi_deg_2}")

# Let's check old one (x0=170)
x0_old = 170
A_old = 145
B_old = 530
C_old = 69
mag_old = math.sqrt(A_old**2 + B_old**2)
alpha_old = math.atan2(B_old, A_old)
phi_old = math.asin(C_old/mag_old) - alpha_old
print(f"Old Angle: {math.degrees(phi_old)}")
