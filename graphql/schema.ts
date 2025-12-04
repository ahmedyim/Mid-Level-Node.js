import { mergeTypeDefs,mergeResolvers } from "@graphql-tools/merge";

import { userTypeDefs,useResolver } from "./user";
import { workTypeDefs,workResolver } from "./workspace";
import {projectResolver,projectTypeDefs,fcmResolvers} from "./project"



export const typeDefs=mergeTypeDefs([userTypeDefs,workTypeDefs,projectTypeDefs])
export const resolvers=mergeResolvers([useResolver,workResolver,projectResolver,fcmResolvers])