import type { Token, TokenType } from './lexer';
import type {
  Argument,
  AssignmentStatement,
  DestructuringAssignment,
  Expression,
  IfStatement,
  Program,
  ReassignmentStatement,
  Statement,
  VarDeclaration,
} from './ast';
import { PineSyntaxError } from './errors';

const KEYWORDS = new Set(['var', 'if', 'else', 'and', 'or', 'not', 'na']);

/**
 * Recursive-descent parser over the Pine subset: assignments, `var`
 * declarations, `:=` reassignment, `if`/`else if`/`else` with
 * indentation-delimited blocks, ta.macd-style destructuring assignment,
 * arithmetic/comparison/logical expressions with scalar/vector operands,
 * historical indexing (`x[1]`), dotted member calls (ta.sma, input.int, ...),
 * and positional/named call arguments. No loops or user-defined functions.
 */
export function parse(tokens: Token[]): Program {
  let pos = 0;

  function peek(): Token {
    return tokens[pos];
  }
  function advance(): Token {
    return tokens[pos++];
  }
  function check(type: TokenType): boolean {
    return peek().type === type;
  }
  function checkKeyword(word: string): boolean {
    return peek().type === 'IDENTIFIER' && peek().value === word;
  }
  function match(type: TokenType): Token | null {
    return check(type) ? advance() : null;
  }
  function expect(type: TokenType, message: string): Token {
    const tok = peek();
    if (tok.type !== type) throw new PineSyntaxError(message, tok.line, tok.col);
    return advance();
  }
  function expectKeyword(word: string): Token {
    if (!checkKeyword(word)) {
      const tok = peek();
      throw new PineSyntaxError(`Expected '${word}'`, tok.line, tok.col);
    }
    return advance();
  }
  function skipNewlines() {
    while (match('NEWLINE')) {
      /* noop */
    }
  }

  function parseProgram(): Program {
    const body: Statement[] = [];
    skipNewlines();
    while (!check('EOF')) {
      const stmt = parseStatement();
      body.push(stmt);
      requireStatementSeparator(stmt);
      skipNewlines();
    }
    return { type: 'Program', body };
  }

  /** INDENT Statement+ DEDENT */
  function parseBlock(): Statement[] {
    skipNewlines();
    expect('INDENT', 'Expected an indented block');
    skipNewlines();
    const statements: Statement[] = [];
    while (!check('DEDENT') && !check('EOF')) {
      const stmt = parseStatement();
      statements.push(stmt);
      requireStatementSeparator(stmt);
      skipNewlines();
    }
    expect('DEDENT', 'Expected end of indented block');
    return statements;
  }

  // A block-terminated statement (if/else) already consumes its own
  // trailing line break(s) while closing its nested block(s) via
  // parseBlock's own DEDENT handling, so no separator remains to check for
  // here. Only "simple" single-line statements need one.
  function requireStatementSeparator(stmt: Statement) {
    if (stmt.type === 'IfStatement') return;
    if (!check('EOF') && !check('DEDENT')) expect('NEWLINE', 'Expected end of line');
  }

  function parseStatement(): Statement {
    if (check('LBRACKET')) return parseDestructuring();
    if (checkKeyword('var')) return parseVarDeclaration();
    if (checkKeyword('if')) return parseIfStatement();
    if (check('IDENTIFIER') && tokens[pos + 1]?.type === 'WALRUS') return parseReassignment();
    if (check('IDENTIFIER') && tokens[pos + 1]?.type === 'EQUALS') return parseAssignment();
    const line = peek().line;
    const expression = parseExpression();
    return { type: 'ExpressionStatement', expression, line };
  }

  function parseDestructuring(): DestructuringAssignment {
    const start = expect('LBRACKET', "Expected '['");
    const names: string[] = [expect('IDENTIFIER', 'Expected identifier').value];
    while (match('COMMA')) names.push(expect('IDENTIFIER', 'Expected identifier').value);
    expect('RBRACKET', "Expected ']'");
    expect('EQUALS', "Expected '=' after destructuring targets");
    const value = parseExpression();
    return { type: 'DestructuringAssignment', names, value, line: start.line };
  }

  function parseVarDeclaration(): VarDeclaration {
    const start = expectKeyword('var');
    // Optional type annotation ('box', 'float', 'bool', ...): an identifier
    // followed by another identifier means the first one is a type name.
    if (check('IDENTIFIER') && tokens[pos + 1]?.type === 'IDENTIFIER') advance();
    const name = expect('IDENTIFIER', 'Expected identifier').value;
    expect('EQUALS', "Expected '=' in var declaration");
    const value = parseExpression();
    return { type: 'VarDeclaration', name, value, line: start.line };
  }

  function parseReassignment(): ReassignmentStatement {
    const nameTok = expect('IDENTIFIER', 'Expected identifier');
    expect('WALRUS', "Expected ':='");
    const value = parseExpression();
    return { type: 'ReassignmentStatement', name: nameTok.value, value, line: nameTok.line };
  }

  function parseAssignment(): AssignmentStatement {
    const nameTok = expect('IDENTIFIER', 'Expected identifier');
    expect('EQUALS', "Expected '='");
    const value = parseExpression();
    return { type: 'AssignmentStatement', name: nameTok.value, value, line: nameTok.line };
  }

  function parseIfStatement(): IfStatement {
    const start = expectKeyword('if');
    const condition = parseExpression();
    const thenBlock = parseBlock();
    let elseBlock: Statement[] | null = null;

    if (checkKeyword('else')) {
      advance();
      if (checkKeyword('if')) {
        elseBlock = [parseIfStatement()];
      } else {
        elseBlock = parseBlock();
      }
    }

    return { type: 'IfStatement', condition, thenBlock, elseBlock, line: start.line };
  }

  // Expression precedence, loosest to tightest:
  // or > and > not > comparison > additive > multiplicative > unary > postfix > primary
  function parseExpression(): Expression {
    return parseOr();
  }

  function parseOr(): Expression {
    let left = parseAnd();
    while (checkKeyword('or')) {
      const opTok = advance();
      const right = parseAnd();
      left = { type: 'LogicalExpression', operator: 'or', left, right, line: opTok.line };
    }
    return left;
  }

  function parseAnd(): Expression {
    let left = parseNot();
    while (checkKeyword('and')) {
      const opTok = advance();
      const right = parseNot();
      left = { type: 'LogicalExpression', operator: 'and', left, right, line: opTok.line };
    }
    return left;
  }

  function parseNot(): Expression {
    if (checkKeyword('not')) {
      const opTok = advance();
      const argument = parseNot();
      return { type: 'UnaryExpression', operator: 'not', argument, line: opTok.line };
    }
    return parseComparison();
  }

  const COMPARISON_TOKENS: Partial<Record<TokenType, '==' | '!=' | '>' | '<' | '>=' | '<='>> = {
    EQEQ: '==',
    NE: '!=',
    GT: '>',
    LT: '<',
    GE: '>=',
    LE: '<=',
  };

  function parseComparison(): Expression {
    let left = parseAdditive();
    while (peek().type in COMPARISON_TOKENS) {
      const opTok = advance();
      const operator = COMPARISON_TOKENS[opTok.type];
      if (!operator) break;
      const right = parseAdditive();
      left = { type: 'BinaryExpression', operator, left, right, line: opTok.line };
    }
    return left;
  }

  function parseAdditive(): Expression {
    let left = parseMultiplicative();
    while (check('PLUS') || check('MINUS')) {
      const opTok = advance();
      const right = parseMultiplicative();
      left = { type: 'BinaryExpression', operator: opTok.type === 'PLUS' ? '+' : '-', left, right, line: opTok.line };
    }
    return left;
  }

  function parseMultiplicative(): Expression {
    let left = parseUnary();
    while (check('STAR') || check('SLASH')) {
      const opTok = advance();
      const right = parseUnary();
      left = { type: 'BinaryExpression', operator: opTok.type === 'STAR' ? '*' : '/', left, right, line: opTok.line };
    }
    return left;
  }

  function parseUnary(): Expression {
    if (check('MINUS')) {
      const opTok = advance();
      const argument = parseUnary();
      return { type: 'UnaryExpression', operator: '-', argument, line: opTok.line };
    }
    return parsePostfix();
  }

  function parsePostfix(): Expression {
    let expr = parsePrimary();
    for (;;) {
      if (match('DOT')) {
        const prop = expect('IDENTIFIER', 'Expected property name after "."');
        expr = { type: 'MemberAccess', object: expr, property: prop.value, line: prop.line };
        continue;
      }
      if (check('LPAREN')) {
        const lparen = advance();
        const args = parseArguments();
        expect('RPAREN', "Expected ')'");
        expr = { type: 'CallExpression', callee: expr, args, line: lparen.line };
        continue;
      }
      if (check('LBRACKET')) {
        const lbracket = advance();
        const index = parseExpression();
        expect('RBRACKET', "Expected ']'");
        expr = { type: 'IndexExpression', object: expr, index, line: lbracket.line };
        continue;
      }
      break;
    }
    return expr;
  }

  function parseArguments(): Argument[] {
    const args: Argument[] = [];
    if (check('RPAREN')) return args;
    args.push(parseArgument());
    while (match('COMMA')) args.push(parseArgument());
    return args;
  }

  function parseArgument(): Argument {
    if (check('IDENTIFIER') && !KEYWORDS.has(peek().value) && tokens[pos + 1]?.type === 'EQUALS') {
      const name = advance().value;
      advance(); // '='
      return { name, value: parseExpression() };
    }
    return { value: parseExpression() };
  }

  function parsePrimary(): Expression {
    const tok = peek();
    if (tok.type === 'NUMBER') {
      advance();
      return { type: 'NumberLiteral', value: parseFloat(tok.value), line: tok.line };
    }
    if (tok.type === 'STRING') {
      advance();
      return { type: 'StringLiteral', value: tok.value, line: tok.line };
    }
    if (tok.type === 'IDENTIFIER') {
      advance();
      return { type: 'Identifier', name: tok.value, line: tok.line };
    }
    if (tok.type === 'LPAREN') {
      advance();
      const expr = parseExpression();
      expect('RPAREN', "Expected ')'");
      return expr;
    }
    throw new PineSyntaxError(`Unexpected token '${tok.value || tok.type}'`, tok.line, tok.col);
  }

  return parseProgram();
}
