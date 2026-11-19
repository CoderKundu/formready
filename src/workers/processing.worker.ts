import { expose } from 'comlink'
import { processingApi } from './processing-api'

// Runs in a Web Worker. Use getProcessor() from ./client to call it.
expose(processingApi)
