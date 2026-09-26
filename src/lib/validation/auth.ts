import { z } from "zod";
import { emailField, passwordField, requiredText } from "./common";

export const registerSchema = z.object({
  name: requiredText("Name", 2, 80),
  email: emailField,
  password: passwordField,
  terms: z.literal("on", { error: "Please accept the terms to continue." }),
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

export const profileSchema = z.object({
  name: requiredText("Name", 2, 80),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { error: "Enter your current password." }).max(128),
  newPassword: passwordField,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, { error: "Enter your password to confirm." }).max(128),
  confirm: z.literal("DELETE", { error: 'Type "DELETE" to confirm.' }),
});
