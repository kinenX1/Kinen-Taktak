import { z } from "zod";
import { emailField, optionalText, passwordField, requiredText } from "./common";

export const registerSchema = z.object({
  name: requiredText("Name", 2, 80),
  email: emailField,
  phone: optionalText(40),
  password: passwordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, { error: "Password is required." }).max(128),
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(100),
  password: passwordField,
});
