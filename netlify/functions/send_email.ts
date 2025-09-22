import type { Handler } from "@netlify/functions";
import fetch from "node-fetch";

const handler: Handler = async function(event) {
  if (event.body === null) {
    return {
      statusCode: 400,
      body: JSON.stringify("Payload required"),
    };
  }

  const requestBody = JSON.parse(event.body) as {
    name: string;
    email: string;
    phone: string;
    message: string;
  };
  if (
    !requestBody.name ||
    !requestBody.email ||
    !requestBody.message
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify("All fields are required"),
    };
  }
  await fetch(`${process.env.URL}/.netlify/functions/emails/contactus`, {
    headers: {
      "netlify-emails-secret": process.env.NETLIFY_EMAILS_SECRET as string,
    },
    method: "POST",
    body: JSON.stringify({
      from: "contactus@ironfeast.tv",
      to: process.env.CONTACT_US_EMAIL,
      subject: "New contact information",
      parameters: {
        name: requestBody.name,
        email: requestBody.email,
        phone: requestBody.phone,
        message: requestBody.message,
      },
    }),
  }).catch((error) => {
    console.error("Error sending email:", error);
    return { 
    statusCode: 500,
    body: JSON.stringify("Unable to save contact information, please try again later."),
   };
  });

  console.log("Just sent email to", requestBody.email);

  return {
    statusCode: 200,
    body: JSON.stringify("Subscribe email sent!"),
  };
};

export { handler };