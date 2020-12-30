/*
 * Copyright 2018-2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as dagre from 'dagre';
import { color } from '../Css';
import { Constants } from './Constants';
import { parseTaskDisplayName } from './ParserUtils';

export type nodeType = 'container' | 'resource' | 'dag' | 'unknown';

export interface KeyValue<T> extends Array<any> {
  0?: string;
  1?: T;
}

export class SelectedNodeInfo {
  public args: string[];
  public command: string[];
  public condition: string;
  public image: string;
  public inputs: Array<KeyValue<string>>;
  public nodeType: nodeType;
  public outputs: Array<KeyValue<string>>;
  public volumeMounts: Array<KeyValue<string>>;
  public resource: Array<KeyValue<string>>;

  constructor() {
    this.args = [];
    this.command = [];
    this.condition = '';
    this.image = '';
    this.inputs = [[]];
    this.nodeType = 'unknown';
    this.outputs = [[]];
    this.volumeMounts = [[]];
    this.resource = [[]];
  }
}

export function _populateInfoFromTask(info: SelectedNodeInfo, task?: any): SelectedNodeInfo {
  if (!task) {
    return info;
  }

  info.nodeType = 'container';
  if (task['taskSpec'] && task['taskSpec']['steps']) {
    const steps = task['taskSpec']['steps'];
    info.args = steps[0]['args'] || [];
    info.command = steps[0]['command'] || [];
    info.image = steps[0]['image'] || [];
    info.volumeMounts = (steps[0]['volumeMounts'] || []).map((volume: any) => [
      volume.mountPath,
      volume.name,
    ]);
  }

  if (task['taskSpec'] && task['taskSpec']['params'])
    info.inputs = (task['taskSpec']['params'] || []).map((p: any) => [p['name'], p['value'] || '']);
  if (task['taskSpec'] && task['taskSpec']['results'])
    info.outputs = (task['taskSpec']['results'] || []).map((p: any) => {
      return [p['name'], p['description'] || ''];
    });

  return info;
}

let loopNumber = 1;
let loopTaskList: string[] = [];

export function createGraph(workflow: any): dagre.graphlib.Graph {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({});
  graph.setDefaultEdgeLabel(() => ({}));

  buildTektonDag(graph, workflow);
  return graph;
}

function buildTektonDag(
  graph: dagre.graphlib.Graph,
  template: any,
  startloop: string = '',
  endloop: string = '',
): void {
  const pipeline = template;
  const tasks = (pipeline['spec']['pipelineSpec']['tasks'] || []).concat(
    pipeline['spec']['pipelineSpec']['finally'] || [],
  );

  const exitHandlers =
    (pipeline['spec']['pipelineSpec']['finally'] || []).map((element: any) => {
      return element['name'];
    }) || [];

  for (const task of tasks) {
    const taskName = task['name'];

    // Checks for dependencies mentioned in the runAfter section of a task and then checks for dependencies based
    // on task output being passed in as parameters
    if (task['runAfter'])
      task['runAfter'].forEach((depTask: any) => {
        if (loopTaskList.includes(depTask)) {
          depTask = depTask + '-end';
        }
        graph.setEdge(depTask, taskName);
      });

    // Adds any dependencies that arise from Conditions and tracks these dependencies to make sure they aren't duplicated in the case that
    // the Condition and the base task use output from the same dependency
    for (const condition of task['when'] || []) {
      const input = condition['input'];
      if (input.substring(0, 8) === '$(tasks.' && input.substring(input.length - 1) === ')') {
        const paramSplit = input.split('.');
        let parentTask = paramSplit[1];
        if (loopTaskList.includes(parentTask)) {
          parentTask = parentTask + '-end';
        }
        graph.setEdge(parentTask, taskName);
      }
    }

    // Adds any dependencies that arise from Conditions and tracks these dependencies to make sure they aren't duplicated in the case that
    // the Condition and the base task use output from the same dependency
    for (const condition of task['conditions'] || []) {
      for (const condParam of condition['params'] || []) {
        if (
          condParam['value'].substring(0, 8) === '$(tasks.' &&
          condParam['value'].substring(condParam['value'].length - 1) === ')'
        ) {
          const paramSplit = condParam['value'].split('.');
          let parentTask = paramSplit[1];
          if (loopTaskList.includes(parentTask)) {
            parentTask = parentTask + '-end';
          }
          graph.setEdge(parentTask, taskName);
        }
      }
    }

    for (const param of task['params'] || []) {
      for (const paramValue of param['value'] || []) {
        if (
          paramValue.substring(0, 8) === '$(tasks.' &&
          paramValue.substring(param['value'].length - 1) === ')'
        ) {
          const paramSplit = paramValue.split('.');
          const parentTask = paramSplit[1];
          graph.setEdge(parentTask, taskName);
        }
      }
    }

    // Add the info for this node
    const info = new SelectedNodeInfo();
    _populateInfoFromTask(info, task);

    const label = exitHandlers.includes(task['name']) ? 'onExit - ' + taskName : taskName;
    const bgColor = exitHandlers.includes(task['name'])
      ? color.lightGrey
      : task.when
      ? 'cornsilk'
      : undefined;

    if (task['taskSpec']) {
      graph.setNode(taskName, {
        bgColor: bgColor,
        height: Constants.NODE_HEIGHT,
        info,
        label: parseTaskDisplayName(task['taskSpec']) || label,
        width: Constants.NODE_WIDTH,
      });
    } else if (task['taskRef'] && task['taskRef']['kind'] === 'PipelineLoop') {
      // handle the case of loop pipelines
      graph.setNode(taskName, {
        bgColor: bgColor,
        height: Constants.NODE_HEIGHT,
        info,
        label: 'start-loop-' + loopNumber,
        width: Constants.NODE_WIDTH,
      });
      const loopPipelineName = task['taskRef']['name'];
      const loopPipeline = JSON.parse(
        pipeline['metadata']['annotations']['tekton.dev/' + loopPipelineName],
      );
      const endLoopName = taskName + '-end';
      loopTaskList.push(taskName);
      graph.setNode(endLoopName, {
        bgColor: bgColor,
        height: Constants.NODE_HEIGHT,
        info,
        label: 'end-loop-' + loopNumber++,
        width: Constants.NODE_WIDTH,
      });
      buildTektonDag(graph, loopPipeline, taskName, endLoopName);
    }
    if (startloop && endloop) {
      for (const looptask of tasks) {
        const loopTaskName = looptask['name'];
        if (graph.inEdges(loopTaskName)?.length === 0) {
          graph.setEdge(startloop, loopTaskName);
        }
        if (graph.outEdges(loopTaskName)?.length === 0) {
          graph.setEdge(loopTaskName, endloop);
        }
      }
    }
  }
}
