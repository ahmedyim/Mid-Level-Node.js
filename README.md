# nfd4

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
=======
```bash
bun run index.ts
```
This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
---User must be created using graphql first and login using rest api and use the accessToken comes from RestApi login 

mutation{
  createUser(name: "Ahmed", phone: "09000", email: "test@gmail.com", password:"test123",globalStatus:ADMIN ) {
    id,
    name,
    phone,
    email,
    password,
    globalStatus
  }
}
--Use above access Token as Authorization  Bearer token for graphql
--Use your own dotenv variables for email database Security Key values

