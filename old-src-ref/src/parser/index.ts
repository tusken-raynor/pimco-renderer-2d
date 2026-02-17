import utils, { WorkerSuite } from '@/utils';
import { parseTemplate } from './lib';
import Worker from './worker?worker';

let parserWorker: WorkerSuite | null = null;

export default {
  parseTemplate<T>(config: Parameters<typeof parseTemplate<T>>[0]){
    if (!parserWorker) {
      parserWorker = utils.createWorkerSuite(new Worker());
    }
    return parserWorker.post({ action: 'parseTemplate', data: config }) as Promise<ReturnType<typeof parseTemplate<T>>>;
  },
  parseTemplateSync: parseTemplate,
}