import { z } from "zod";
import { emailField, optionalText, requiredText } from "./common";

export const contactSchema = z.object({
  name: requiredText("Name", 2, 80),
  email: emailField,
  company: optionalText(120),
  subject: requiredText("Subject", 2, 150),
  message: requiredText("Message", 10, 5000),
});
