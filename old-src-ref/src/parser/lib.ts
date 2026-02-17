export function parseTemplate<T>(config: {
  return: T;
  count: number;
  variables: Record<string, any>;
}): T[] {
  const { return: template, count, variables } = config;
  const results: any[] = [];
  
  for (let i = 0; i < count; i++) {
    const context = { i, ...variables };
    const item = processValue(template, context);
    results.push(item);
  }
  
  return results;
}

function processValue(value: any, context: Record<string, any>): any {
  if (typeof value === 'string') {
    return evaluateExpression(value, context);
  } else if (Array.isArray(value)) {
    return value.map(v => processValue(v, context));
  } else if (typeof value === 'object' && value !== null) {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      const processedKey = evaluateExpression(key, context);
      result[processedKey] = processValue(val, context);
    }
    return result;
  }
  return value;
}

function evaluateExpression(expr: string, context: Record<string, any>): string {
  let result = '';
  let i = 0;
  
  while (i < expr.length) {
    if (expr[i] === '$') {
      // Found a variable chain, extract it
      let chain = '$';
      i++;
      
      // Read the entire chain including nested parentheses
      let parenDepth = 0;
      while (i < expr.length) {
        const char = expr[i];
        
        if (char === '(') {
          parenDepth++;
          chain += char;
          i++;
        } else if (char === ')') {
          if (parenDepth > 0) {
            parenDepth--;
            chain += char;
            i++;
          } else {
            // This paren doesn't belong to our chain
            break;
          }
        } else if (parenDepth === 0 && (char === ' ' || char === '-')) {
          // End of chain
          break;
        } else if (/[\w:$]/.test(char)) {
          chain += char;
          i++;
        } else {
          break;
        }
      }
      
      // Evaluate the chain and add to result
      result += String(evaluateChain(chain, context));
    } else {
      // Regular character
      result += expr[i];
      i++;
    }
  }
  
  return result;
}

function evaluateChain(chain: string, context: Record<string, any>): any {
  // Remove the leading $
  chain = chain.slice(1);
  
  // Need to carefully parse this to handle nested method calls
  // Split into tokens
  const tokens = tokenizeChain(chain);
  
  // First token is the variable name
  let result = context[tokens[0].value];
  
  // Process remaining tokens
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (token.type === 'method') {
      if (token.arg !== null) {
        // Evaluate the argument if it's a variable chain
        let argValue;
        if (token.arg.startsWith('$')) {
          argValue = evaluateChain(token.arg, context);
        } else {
          argValue = isNaN(token.arg) ? token.arg : Number(token.arg);
        }
        result = applyMethod(token.value, result, argValue);
      } else {
        result = applyMethod(token.value, result);
      }
    }
  }
  
  return result;
}

function tokenizeChain(chain: string): Array<{ type: string; value: string; arg: any }> {
  const tokens: Array<{ type: string; value: string; arg: any }> = [];
  let i = 0;
  
  while (i < chain.length) {
    // Check if we're at a colon (method separator)
    if (chain[i] === ':') {
      i++;
      continue;
    }
    
    // Read method/variable name
    let name = '';
    while (i < chain.length && chain[i] !== ':' && chain[i] !== '(') {
      name += chain[i];
      i++;
    }
    
    // Check if this is a method call with arguments
    if (i < chain.length && chain[i] === '(') {
      i++; // skip opening paren
      
      // Extract argument (including nested chains)
      let arg = '';
      let parenDepth = 1;
      while (i < chain.length && parenDepth > 0) {
        if (chain[i] === '(') parenDepth++;
        if (chain[i] === ')') parenDepth--;
        
        if (parenDepth > 0) {
          arg += chain[i];
        }
        i++;
      }
      
      tokens.push({ type: 'method', value: name, arg: arg });
    } else {
      // Variable or method without args
      tokens.push({ type: tokens.length === 0 ? 'variable' : 'method', value: name, arg: null });
    }
  }
  
  return tokens;
}

function applyMethod(method: string, value: any, arg?: any): any {
  switch (method) {
    case 'mod':
      return value % arg;
    case 'div':
      return value / arg;
    case 'add':
      return value + arg;
    case 'sub':
      return value - arg;
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'round':
      return Math.round(value);
    case 'lowercase':
      return String(value).toLowerCase();
    case 'uppercase':
      return String(value).toUpperCase();
    case 'get':
      const key = String(arg);
      return value[key];
    default:
      return value;
  }
}