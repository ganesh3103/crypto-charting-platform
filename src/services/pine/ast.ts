export interface Program {
  type: 'Program';
  body: Statement[];
}

export type Statement =
  | AssignmentStatement
  | DestructuringAssignment
  | ExpressionStatement
  | VarDeclaration
  | ReassignmentStatement
  | IfStatement;

export interface AssignmentStatement {
  type: 'AssignmentStatement';
  name: string;
  value: Expression;
  line: number;
}

export interface DestructuringAssignment {
  type: 'DestructuringAssignment';
  names: string[];
  value: Expression;
  line: number;
}

export interface ExpressionStatement {
  type: 'ExpressionStatement';
  expression: Expression;
  line: number;
}

/** `var [type] name = expr` — initializer runs once; the value then persists across bars unless reassigned. */
export interface VarDeclaration {
  type: 'VarDeclaration';
  name: string;
  value: Expression;
  line: number;
}

/** `name := expr` — reassigns an existing (typically `var`-declared) binding for the current bar. */
export interface ReassignmentStatement {
  type: 'ReassignmentStatement';
  name: string;
  value: Expression;
  line: number;
}

export interface IfStatement {
  type: 'IfStatement';
  condition: Expression;
  thenBlock: Statement[];
  elseBlock: Statement[] | null;
  line: number;
}

export type Expression =
  | CallExpression
  | MemberAccess
  | IndexExpression
  | LogicalExpression
  | BinaryExpression
  | UnaryExpression
  | Identifier
  | NumberLiteral
  | StringLiteral;

export interface Argument {
  name?: string;
  value: Expression;
}

export interface CallExpression {
  type: 'CallExpression';
  callee: Expression;
  args: Argument[];
  line: number;
}

export interface MemberAccess {
  type: 'MemberAccess';
  object: Expression;
  property: string;
  line: number;
}

/** `identifier[n]` — historical access, n bars back. Only a plain identifier is supported as the object. */
export interface IndexExpression {
  type: 'IndexExpression';
  object: Expression;
  index: Expression;
  line: number;
}

export interface LogicalExpression {
  type: 'LogicalExpression';
  operator: 'and' | 'or';
  left: Expression;
  right: Expression;
  line: number;
}

export interface BinaryExpression {
  type: 'BinaryExpression';
  operator: '+' | '-' | '*' | '/' | '==' | '!=' | '>' | '<' | '>=' | '<=';
  left: Expression;
  right: Expression;
  line: number;
}

export interface UnaryExpression {
  type: 'UnaryExpression';
  operator: '-' | 'not';
  argument: Expression;
  line: number;
}

export interface Identifier {
  type: 'Identifier';
  name: string;
  line: number;
}

export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
  line: number;
}

export interface StringLiteral {
  type: 'StringLiteral';
  value: string;
  line: number;
}
